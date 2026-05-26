use axum::extract::{Path, Query, State};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::auth::AdminUser;
use crate::error::{AppError, AppResult};
use crate::models::{User, UserRole, UserStatus};
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list))
        .route("/:id", patch(update))
        .route("/:id/topup", post(topup))
        .route(
            "/:id/group-overrides",
            get(get_overrides).put(set_overrides),
        )
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    search: Option<String>,
    status: Option<UserStatus>,
}

#[derive(Debug, Serialize)]
struct AdminUserView {
    #[serde(flatten)]
    row: repo::users::AdminUserRow,
    /// Group IDs the user can actually use right now. Computed by combining
    /// the system-wide default list with this user's overrides.
    effective_group_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
struct UsersResponse {
    items: Vec<AdminUserView>,
    total: i64,
    page: i64,
    page_size: i64,
}

async fn list(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<UsersResponse>> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let filter = repo::users::UserFilter {
        search: q.search.as_deref(),
        status: q.status,
    };
    let page_data = repo::users::list(&state.db, filter, page_size, offset).await?;

    // Resolve effective groups per row. The default list and groups table
    // are loaded once and reused for every user.
    let defaults = repo::user_groups::get_default_user_group_ids(&state.db).await?;
    let groups = repo::groups::list(&state.db).await?;

    let mut items = Vec::with_capacity(page_data.items.len());
    for row in page_data.items {
        let overrides = repo::user_groups::list_overrides(&state.db, row.id).await?;
        let effective_group_ids =
            repo::user_groups::compute_effective(row.role, &defaults, &overrides, &groups);
        items.push(AdminUserView {
            row,
            effective_group_ids,
        });
    }

    Ok(Json(UsersResponse {
        items,
        total: page_data.total,
        page,
        page_size,
    }))
}

#[derive(Debug, Deserialize)]
struct UpdateUserRequest {
    status: Option<UserStatus>,
}

#[derive(Debug, Serialize)]
struct UserRow {
    id: i64,
    username: String,
    email: Option<String>,
    role: UserRole,
    status: UserStatus,
    balance_cents: i64,
    total_used_cents: i64,
}

impl From<User> for UserRow {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            status: u.status,
            balance_cents: u.balance_cents,
            total_used_cents: u.total_used_cents,
        }
    }
}

async fn update(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<i64>,
    Json(body): Json<UpdateUserRequest>,
) -> AppResult<Json<UserRow>> {
    // Guardrail: an admin can't lock themselves out by disabling their own account.
    if id == admin.user_id() && matches!(body.status, Some(UserStatus::Disabled)) {
        return Err(AppError::BadRequest(
            "cannot disable your own account".into(),
        ));
    }
    let u = repo::users::update(
        &state.db,
        id,
        repo::users::UpdateUser {
            status: body.status,
        },
    )
    .await?;
    Ok(Json(u.into()))
}

#[derive(Debug, Deserialize)]
struct TopUpRequest {
    amount_cents: i64,
    #[serde(default)]
    bonus_cents: i64,
    #[serde(default)]
    note: String,
}

async fn topup(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
    Json(body): Json<TopUpRequest>,
) -> AppResult<Json<UserRow>> {
    let u = repo::users::topup(
        &state.db,
        id,
        body.amount_cents,
        body.bonus_cents,
        &body.note,
    )
    .await?;
    Ok(Json(u.into()))
}

#[derive(Debug, Serialize)]
struct OverridesResponse {
    /// System-wide default group IDs (read-only here; managed via admin settings).
    default_group_ids: Vec<i64>,
    /// Group IDs explicitly added for this user.
    added_group_ids: Vec<i64>,
    /// Group IDs explicitly removed for this user (overrides default + added).
    removed_group_ids: Vec<i64>,
    /// Final list this user can actually use.
    effective_group_ids: Vec<i64>,
}

async fn get_overrides(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
) -> AppResult<Json<OverridesResponse>> {
    let user = repo::users::get(&state.db, id).await?;
    let defaults = repo::user_groups::get_default_user_group_ids(&state.db).await?;
    let groups = repo::groups::list(&state.db).await?;
    let overrides = repo::user_groups::list_overrides(&state.db, id).await?;
    let mut added = Vec::new();
    let mut removed = Vec::new();
    for o in &overrides {
        match o.mode {
            repo::user_groups::OverrideMode::Add => added.push(o.group_id),
            repo::user_groups::OverrideMode::Remove => removed.push(o.group_id),
        }
    }
    let effective = repo::user_groups::compute_effective(user.role, &defaults, &overrides, &groups);
    Ok(Json(OverridesResponse {
        default_group_ids: defaults,
        added_group_ids: added,
        removed_group_ids: removed,
        effective_group_ids: effective,
    }))
}

#[derive(Debug, Deserialize)]
struct SetOverridesRequest {
    /// Group IDs this user is explicitly granted (on top of system defaults).
    #[serde(default)]
    added_group_ids: Vec<i64>,
    /// Group IDs this user is explicitly denied (subtracted from defaults+added).
    #[serde(default)]
    removed_group_ids: Vec<i64>,
}

async fn set_overrides(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<i64>,
    Json(body): Json<SetOverridesRequest>,
) -> AppResult<Json<OverridesResponse>> {
    let groups = repo::groups::list(&state.db).await?;
    let valid_group_ids: HashSet<i64> = groups.into_iter().map(|g| g.id).collect();
    let added_group_ids =
        clean_group_ids("added_group_ids", body.added_group_ids, &valid_group_ids)?;
    let removed_group_ids = clean_group_ids(
        "removed_group_ids",
        body.removed_group_ids,
        &valid_group_ids,
    )?;

    // Sanity: a single group can't be both added and removed.
    let dup = added_group_ids
        .iter()
        .any(|a| removed_group_ids.contains(a));
    if dup {
        return Err(AppError::BadRequest(
            "a group cannot appear in both added and removed".into(),
        ));
    }
    repo::users::get(&state.db, id).await?; // 404 if user gone
    repo::user_groups::replace_overrides(&state.db, id, &added_group_ids, &removed_group_ids)
        .await?;
    get_overrides(State(state), admin, Path(id)).await
}

fn clean_group_ids(
    field: &str,
    ids: Vec<i64>,
    valid_group_ids: &HashSet<i64>,
) -> AppResult<Vec<i64>> {
    let mut seen = HashSet::new();
    let mut cleaned = Vec::with_capacity(ids.len());
    for id in ids {
        if !valid_group_ids.contains(&id) {
            return Err(AppError::BadRequest(format!(
                "{field} contains unknown group id {id}"
            )));
        }
        if seen.insert(id) {
            cleaned.push(id);
        }
    }
    Ok(cleaned)
}

#[cfg(test)]
mod tests {
    use super::clean_group_ids;
    use std::collections::HashSet;

    #[test]
    fn clean_group_ids_dedupes_preserving_order() {
        let valid = HashSet::from([1, 2, 3]);
        let cleaned = clean_group_ids("added_group_ids", vec![2, 1, 2, 3], &valid).unwrap();
        assert_eq!(cleaned, vec![2, 1, 3]);
    }

    #[test]
    fn clean_group_ids_rejects_unknown_ids() {
        let valid = HashSet::from([1, 2]);
        let err = clean_group_ids("removed_group_ids", vec![1, 9], &valid).unwrap_err();
        assert!(err.to_string().contains("unknown group id 9"));
    }
}
