//! User ↔ group access model.
//!
//! Each regular user's set of usable groups is computed dynamically as:
//!   (system_settings.default_user_groups ∪ user 'add' overrides)
//!  − user 'remove' overrides
//!  ∩ groups WHERE enabled = TRUE
//!
//! Admins bypass this and see every enabled group.

use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Transaction};

use crate::error::AppResult;
use crate::models::{Group, UserRole};

const DEFAULT_USER_GROUPS_KEY: &str = "default_user_groups";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OverrideMode {
    Add,
    Remove,
}

impl OverrideMode {
    fn as_str(self) -> &'static str {
        match self {
            OverrideMode::Add => "add",
            OverrideMode::Remove => "remove",
        }
    }

    fn parse(s: &str) -> Self {
        match s {
            "remove" => OverrideMode::Remove,
            _ => OverrideMode::Add,
        }
    }
}

#[derive(Debug, Clone)]
pub struct UserGroupOverride {
    pub group_id: i64,
    pub mode: OverrideMode,
}

/// Read the system-wide default group ID list.
pub async fn get_default_user_group_ids(pool: &PgPool) -> AppResult<Vec<i64>> {
    let row: Option<(serde_json::Value,)> =
        sqlx::query_as("SELECT value FROM system_settings WHERE key = $1")
            .bind(DEFAULT_USER_GROUPS_KEY)
            .fetch_optional(pool)
            .await?;
    Ok(row
        .and_then(|(v,)| serde_json::from_value::<Vec<i64>>(v).ok())
        .unwrap_or_default())
}

/// Replace the system-wide default group ID list.
pub async fn set_default_user_group_ids(pool: &PgPool, ids: &[i64]) -> AppResult<()> {
    let v = serde_json::to_value(ids).expect("serialize default_user_groups");
    sqlx::query(
        "INSERT INTO system_settings (key, value) VALUES ($1, $2) \
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
    )
    .bind(DEFAULT_USER_GROUPS_KEY)
    .bind(v)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_overrides(pool: &PgPool, user_id: i64) -> AppResult<Vec<UserGroupOverride>> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT group_id, mode FROM user_group_overrides WHERE user_id = $1 ORDER BY group_id",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(group_id, mode)| UserGroupOverride {
            group_id,
            mode: OverrideMode::parse(&mode),
        })
        .collect())
}

/// Replace this user's full override set in one transaction.
/// `added` and `removed` must be disjoint — caller validates.
pub async fn replace_overrides(
    pool: &PgPool,
    user_id: i64,
    added: &[i64],
    removed: &[i64],
) -> AppResult<()> {
    let mut tx: Transaction<'_, Postgres> = pool.begin().await?;
    sqlx::query("DELETE FROM user_group_overrides WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    for gid in added {
        sqlx::query(
            "INSERT INTO user_group_overrides (user_id, group_id, mode) VALUES ($1, $2, $3)",
        )
        .bind(user_id)
        .bind(gid)
        .bind(OverrideMode::Add.as_str())
        .execute(&mut *tx)
        .await?;
    }
    for gid in removed {
        sqlx::query(
            "INSERT INTO user_group_overrides (user_id, group_id, mode) VALUES ($1, $2, $3)",
        )
        .bind(user_id)
        .bind(gid)
        .bind(OverrideMode::Remove.as_str())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Compute the effective group ID list for a user. Pure function — caller
/// supplies the inputs so the DB doesn't get hit per row in admin lists.
///
/// Admins receive every enabled group. Regular users receive
/// `(defaults ∪ adds) − removes`, intersected with enabled.
pub fn compute_effective(
    role: UserRole,
    defaults: &[i64],
    overrides: &[UserGroupOverride],
    groups: &[Group],
) -> Vec<i64> {
    let enabled: std::collections::HashSet<i64> = groups
        .iter()
        .filter(|g| g.enabled)
        .map(|g| g.id)
        .collect();

    if role == UserRole::Admin {
        let mut out: Vec<i64> = enabled.into_iter().collect();
        out.sort();
        return out;
    }

    let mut set: std::collections::HashSet<i64> = defaults.iter().copied().collect();
    for o in overrides {
        match o.mode {
            OverrideMode::Add => {
                set.insert(o.group_id);
            }
            OverrideMode::Remove => {
                set.remove(&o.group_id);
            }
        }
    }
    let mut out: Vec<i64> = set.into_iter().filter(|id| enabled.contains(id)).collect();
    out.sort();
    out
}

/// Convenience: load defaults + groups + overrides and compute in one shot.
pub async fn effective_group_ids(
    pool: &PgPool,
    user_id: i64,
    role: UserRole,
) -> AppResult<Vec<i64>> {
    let defaults = get_default_user_group_ids(pool).await?;
    let groups = crate::repo::groups::list(pool).await?;
    let overrides = list_overrides(pool, user_id).await?;
    Ok(compute_effective(role, &defaults, &overrides, &groups))
}

/// Count overrides referencing a given group — used by groups::delete to
/// reject deletes when any user has the group pinned via an override.
pub async fn count_overrides_for_group(pool: &PgPool, group_id: i64) -> AppResult<i64> {
    let n: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_group_overrides WHERE group_id = $1",
    )
    .bind(group_id)
    .fetch_one(pool)
    .await?;
    Ok(n)
}
