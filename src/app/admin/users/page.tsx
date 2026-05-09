"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getEffectiveVipLabel,
  formatDateTime,
  getMembershipPresentation,
  getRoleLabel,
  getStatusLabel,
  getUserInitials,
  isVipActive,
  VIP_TYPE_OPTIONS
} from "@/lib/userPresentation";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  vipType: string;
  vipExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type EditState = {
  role: string;
  status: string;
  vipType: string;
  vipExpiresAt: string;
  name: string;
  nickname: string;
  avatarUrl: string;
};

type BatchState = {
  role: string;
  status: string;
  vipType: string;
  vipExpiresAtMode: "keep" | "set" | "clear";
  vipExpiresAt: string;
};

type BatchFailure = {
  id: string;
  email: string;
  reason: string;
};

type BatchResult = {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  failures: BatchFailure[];
  users: AdminUser[];
};

const DEFAULT_EDIT_STATE: EditState = {
  role: "USER",
  status: "ACTIVE",
  vipType: "none",
  vipExpiresAt: "",
  name: "",
  nickname: "",
  avatarUrl: ""
};

const DEFAULT_BATCH_STATE: BatchState = {
  role: "",
  status: "",
  vipType: "",
  vipExpiresAtMode: "keep",
  vipExpiresAt: ""
};

/**
 * 渲染管理员用户管理页，支持筛选、查看和编辑用户核心运营字段。
 * @returns 管理员用户管理前台页面。
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [editState, setEditState] = useState<EditState>(DEFAULT_EDIT_STATE);
  const [batchState, setBatchState] = useState<BatchState>(DEFAULT_BATCH_STATE);
  const [pageError, setPageError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailSuccess, setDetailSuccess] = useState("");
  const [batchError, setBatchError] = useState("");
  const [batchSuccess, setBatchSuccess] = useState("");
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );
  const selectedUserIdSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const visibleUserIds = useMemo(() => users.map((user) => user.id), [users]);
  const allVisibleSelected = useMemo(
    () =>
      visibleUserIds.length > 0 &&
      visibleUserIds.every((userId) => selectedUserIdSet.has(userId)),
    [selectedUserIdSet, visibleUserIds]
  );
  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIdSet.has(user.id)),
    [selectedUserIdSet, users]
  );
  const userSummary = useMemo(
    () => ({
      total: users.length,
      vip: users.filter((user) => isVipActive(user.vipType, user.vipExpiresAt)).length,
      admins: users.filter((user) => user.role === "ADMIN").length,
      disabled: users.filter((user) => user.status === "DISABLED").length
    }),
    [users]
  );
  const editingMembership = useMemo(
    () => getMembershipPresentation(editState.vipType, editState.vipExpiresAt || null),
    [editState.vipExpiresAt, editState.vipType]
  );
  const selectedMembership = useMemo(
    () => getMembershipPresentation(selectedUser?.vipType, selectedUser?.vipExpiresAt),
    [selectedUser?.vipExpiresAt, selectedUser?.vipType]
  );
  const batchMembershipPreview = useMemo(() => {
    if (!batchState.vipType) {
      return null;
    }

    const previewExpiresAt =
      batchState.vipExpiresAtMode === "set" ? batchState.vipExpiresAt || null : null;

    return getMembershipPresentation(batchState.vipType, previewExpiresAt);
  }, [batchState.vipExpiresAt, batchState.vipExpiresAtMode, batchState.vipType]);

  /**
   * 用选中用户的数据初始化右侧编辑表单。
   * @param user 当前选中的用户。
   */
  function syncEditState(user: AdminUser): void {
    setEditState({
      role: user.role,
      status: user.status,
      vipType: user.vipType || "none",
      vipExpiresAt: user.vipExpiresAt ? user.vipExpiresAt.slice(0, 10) : "",
      name: user.name ?? "",
      nickname: user.nickname ?? "",
      avatarUrl: user.avatarUrl ?? ""
    });
  }

  /**
   * 拉取用户列表，并按当前筛选条件更新管理员视图。
   */
  const loadUsers = useCallback(async (): Promise<void> => {
    setLoading(true);
    setPageError("");

    try {
      const params = new URLSearchParams();
      if (keyword.trim()) {
        params.set("keyword", keyword.trim());
      }
      if (role) {
        params.set("role", role);
      }
      if (status) {
        params.set("status", status);
      }

      const response = await fetch(`/api/admin/users?${params.toString()}`);
      const payload = (await response.json().catch(() => ({}))) as {
        data?: AdminUser[];
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "用户列表加载失败");
      }

      const userList = payload.data;
      setUsers(userList);
      setSelectedUserIds((current) =>
        current.filter((userId) => userList.some((user) => user.id === userId))
      );
      setSelectedUserId((currentSelectedId) => {
        if (userList.length === 0) {
          return "";
        }

        return userList.some((user) => user.id === currentSelectedId)
          ? currentSelectedId
          : userList[0].id;
      });
    } catch (loadError) {
      setPageError(loadError instanceof Error ? loadError.message : "用户列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, role, status]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (selectedUser) {
      syncEditState(selectedUser);
    }
  }, [selectedUser]);

  /**
   * 更新右侧表单的某个字段，减少重复状态代码。
   * @param field 需要更新的字段名。
   * @param value 新的字段值。
   */
  function updateField(field: keyof EditState, value: string): void {
    setEditState((current) => {
      if (field === "vipType" && (value === "none" || value === "lifetime")) {
        return {
          ...current,
          vipType: value,
          vipExpiresAt: ""
        };
      }

      return {
        ...current,
        [field]: value
      };
    });
    setDetailSuccess("");
  }

  /**
   * 更新批量操作表单的某个字段，并处理会员到期规则。
   * @param field 需要更新的字段名。
   * @param value 新的字段值。
   */
  function updateBatchField(field: keyof BatchState, value: string): void {
    setBatchState((current) => {
      if (field === "vipType" && (value === "none" || value === "lifetime")) {
        return {
          ...current,
          vipType: value,
          vipExpiresAtMode: "clear",
          vipExpiresAt: ""
        };
      }

      if (field === "vipExpiresAtMode" && value !== "set") {
        return {
          ...current,
          vipExpiresAtMode: value as BatchState["vipExpiresAtMode"],
          vipExpiresAt: ""
        };
      }

      return {
        ...current,
        [field]: value
      };
    });
    setBatchSuccess("");
  }

  /**
   * 切换某个用户的批量选中状态，仅影响当前勾选集合。
   * @param userId 需要切换的用户 id。
   */
  function toggleUserSelection(userId: string): void {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
    setBatchSuccess("");
  }

  /**
   * 对当前筛选结果执行全选或取消全选，避免误伤不在列表中的用户。
   */
  function handleSelectAllVisible(): void {
    setSelectedUserIds((current) => {
      const currentSet = new Set(current);
      if (allVisibleSelected) {
        return current.filter((userId) => !visibleUserIds.includes(userId));
      }

      visibleUserIds.forEach((userId) => currentSet.add(userId));
      return Array.from(currentSet);
    });
    setBatchSuccess("");
  }

  /**
   * 清空当前已勾选的批量用户集合。
   */
  function clearSelectedUsers(): void {
    setSelectedUserIds([]);
    setBatchSuccess("");
  }

  /**
   * 提交当前选中用户的角色、状态与会员信息变更。
   * @param event 表单提交事件。
   */
  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    setSaving(true);
    setDetailError("");
    setDetailSuccess("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: selectedUser.id,
          ...editState,
          vipExpiresAt: editState.vipExpiresAt || null
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: AdminUser;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "用户更新失败");
      }

      setUsers((current) =>
        current.map((user) => (user.id === payload.data?.id ? payload.data : user))
      );
      syncEditState(payload.data);
      setDetailSuccess("用户信息已更新");
    } catch (submitError) {
      setDetailError(submitError instanceof Error ? submitError.message : "用户更新失败");
    } finally {
      setSaving(false);
    }
  }

  /**
   * 提交当前批量操作，并展示成功数、失败数与失败原因摘要。
   * @param event 表单提交事件。
   */
  async function handleBatchSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (selectedUserIds.length === 0) {
      setBatchError("请先选择至少一个用户");
      setBatchSuccess("");
      return;
    }

    const requestPayload: Record<string, unknown> = {
      ids: selectedUserIds
    };

    if (batchState.role) {
      requestPayload.role = batchState.role;
    }
    if (batchState.status) {
      requestPayload.status = batchState.status;
    }
    if (batchState.vipType) {
      requestPayload.vipType = batchState.vipType;
    }
    if (batchState.vipExpiresAtMode === "clear") {
      requestPayload.vipExpiresAt = null;
    }
    if (batchState.vipExpiresAtMode === "set") {
      if (!batchState.vipExpiresAt) {
        setBatchError("设置批量到期时间时，请先选择日期");
        setBatchSuccess("");
        return;
      }
      requestPayload.vipExpiresAt = batchState.vipExpiresAt;
    }

    if (Object.keys(requestPayload).length === 1) {
      setBatchError("请至少选择一个需要批量修改的字段");
      setBatchSuccess("");
      return;
    }

    setBatchSaving(true);
    setBatchError("");
    setBatchSuccess("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestPayload)
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: BatchResult;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "批量操作失败");
      }

      setBatchResult(payload.data);
      setBatchSuccess(
        payload.data.failureCount > 0
          ? `批量操作完成：成功 ${payload.data.successCount} 人，失败 ${payload.data.failureCount} 人。`
          : `批量操作完成：已成功更新 ${payload.data.successCount} 人。`
      );
      setBatchState(DEFAULT_BATCH_STATE);
      await loadUsers();
    } catch (submitError) {
      setBatchError(submitError instanceof Error ? submitError.message : "批量操作失败");
    } finally {
      setBatchSaving(false);
    }
  }

  return (
    <section className="view active" style={{ display: "grid", gap: "1.5rem" }}>
      <div
        style={{
          padding: "1.75rem",
          borderRadius: "24px",
          border: "1px solid rgba(20, 20, 19, 0.08)",
          background: "rgba(255,255,255,0.9)"
        }}
      >
        <h1 style={{ marginBottom: "0.55rem" }}>用户与会员管理</h1>
        <p style={{ color: "rgba(20, 20, 19, 0.72)", maxWidth: "56ch", marginBottom: 0 }}>
          在这里集中维护用户角色、账号状态、会员类型、到期时间，以及前台展示使用的姓名、昵称和头像信息。
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.9rem" }}>
        {[
          { label: "当前用户", value: `${userSummary.total}` },
          { label: "VIP 用户", value: `${userSummary.vip}` },
          { label: "管理员", value: `${userSummary.admins}` },
          { label: "停用账号", value: `${userSummary.disabled}` }
        ].map((item) => (
          <div
            key={item.label}
            style={{
              padding: "1rem 1.1rem",
              borderRadius: "18px",
              border: "1px solid rgba(20, 20, 19, 0.08)",
              background: "rgba(255,255,255,0.84)"
            }}
          >
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>{item.label}</div>
            <strong style={{ fontSize: "1.35rem", fontFamily: "var(--font-heading)" }}>{item.value}</strong>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "1.5rem",
          borderRadius: "22px",
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(20, 20, 19, 0.08)",
          boxShadow: "0 12px 28px rgba(20, 20, 19, 0.05)"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "1rem"
          }}
        >
          <div>
            <h2 style={{ marginBottom: "0.35rem" }}>批量运营操作</h2>
            <p style={{ color: "rgba(20, 20, 19, 0.72)", marginBottom: 0 }}>
              当前已选 {selectedUserIds.length} 人，只会作用于本次勾选的用户，不影响未选中用户。
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn btn-secondary" onClick={handleSelectAllVisible}>
              {allVisibleSelected ? "取消全选当前结果" : "全选当前结果"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearSelectedUsers}>
              清空已选
            </button>
          </div>
        </div>

        {batchError && <div className="auth-feedback auth-feedback--error">{batchError}</div>}
        {batchSuccess && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.9rem 1rem",
              borderRadius: "14px",
              background: "rgba(120, 140, 93, 0.1)",
              color: "var(--accent-green)"
            }}
          >
            {batchSuccess}
          </div>
        )}

        <form onSubmit={handleBatchSave}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.9rem",
              marginBottom: "1rem"
            }}
          >
            <div className="field">
              <label className="label" htmlFor="admin-batch-role">
                批量角色
              </label>
              <select
                id="admin-batch-role"
                className="input-control"
                value={batchState.role}
                onChange={(event) => updateBatchField("role", event.target.value)}
              >
                <option value="">不修改</option>
                <option value="USER">普通用户</option>
                <option value="ADMIN">管理员</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="admin-batch-status">
                批量状态
              </label>
              <select
                id="admin-batch-status"
                className="input-control"
                value={batchState.status}
                onChange={(event) => updateBatchField("status", event.target.value)}
              >
                <option value="">不修改</option>
                <option value="ACTIVE">正常</option>
                <option value="DISABLED">已停用</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="admin-batch-vip">
                批量会员类型
              </label>
              <select
                id="admin-batch-vip"
                className="input-control"
                value={batchState.vipType}
                onChange={(event) => updateBatchField("vipType", event.target.value)}
              >
                <option value="">不修改</option>
                {VIP_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="admin-batch-vip-mode">
                到期时间
              </label>
              <select
                id="admin-batch-vip-mode"
                className="input-control"
                value={batchState.vipExpiresAtMode}
                onChange={(event) => updateBatchField("vipExpiresAtMode", event.target.value)}
              >
                <option value="keep">保持原样</option>
                <option value="set">统一设置日期</option>
                <option value="clear">统一清空到期</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="admin-batch-vip-expire">
                批量到期日期
              </label>
              <input
                id="admin-batch-vip-expire"
                type="date"
                className="input-control"
                value={batchState.vipExpiresAt}
                disabled={batchState.vipExpiresAtMode !== "set"}
                onChange={(event) => updateBatchField("vipExpiresAt", event.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1fr)",
              gap: "1rem",
              marginBottom: "1rem"
            }}
          >
            <div
              style={{
                padding: "1rem 1.1rem",
                borderRadius: "16px",
                background: "rgba(20, 20, 19, 0.035)",
                border: "1px solid rgba(20, 20, 19, 0.06)"
              }}
            >
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                选中概览
              </div>
              <div style={{ fontWeight: 600, color: "var(--text-dark)", marginBottom: "0.45rem" }}>
                已选 {selectedUsers.length} 人，其中管理员 {selectedUsers.filter((user) => user.role === "ADMIN").length} 人、
                有效 VIP {selectedUsers.filter((user) => isVipActive(user.vipType, user.vipExpiresAt)).length} 人、
                停用账号 {selectedUsers.filter((user) => user.status === "DISABLED").length} 人
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>
                支持批量修改会员类型、会员到期时间、账号状态，必要时也可统一调整角色。
              </div>
              {batchResult && batchResult.failures.length > 0 && (
                <ul style={{ margin: "0.8rem 0 0", paddingLeft: "1.15rem", lineHeight: 1.7 }}>
                  {batchResult.failures.slice(0, 5).map((failure) => (
                    <li key={`${failure.id}-${failure.email}`} style={{ color: "rgba(20, 20, 19, 0.82)" }}>
                      {failure.email}：{failure.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              style={{
                padding: "1rem 1.1rem",
                borderRadius: "16px",
                background: "rgba(20, 20, 19, 0.035)",
                border: "1px solid rgba(20, 20, 19, 0.06)"
              }}
            >
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                会员权益预览（按当前生效口径）
              </div>
              {batchMembershipPreview ? (
                <>
                  <div style={{ fontWeight: 600, color: "var(--text-dark)", marginBottom: "0.45rem" }}>
                    {batchMembershipPreview.effectiveLabel}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginBottom: "0.75rem" }}>
                    {batchMembershipPreview.summary}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.15rem", lineHeight: 1.7 }}>
                    {batchMembershipPreview.benefits.map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>
                  选择一个批量会员类型后，这里会预览前台和后台统一展示的权益摘要。
                </div>
              )}
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={batchSaving}>
            {batchSaving ? "批量提交中..." : "执行批量操作"}
          </button>
        </form>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: "1.5rem" }}>
        <div
          style={{
            padding: "1.5rem",
            borderRadius: "22px",
            background: "rgba(255,255,255,0.88)",
            border: "1px solid rgba(20, 20, 19, 0.08)",
            boxShadow: "0 12px 28px rgba(20, 20, 19, 0.05)"
          }}
        >
          <div className="row" style={{ marginBottom: "1rem" }}>
            <div className="field">
              <label className="label" htmlFor="admin-user-keyword">
                搜索
              </label>
              <input
                id="admin-user-keyword"
                className="input-control"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="邮箱 / 昵称 / 姓名"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="admin-user-role">
                角色
              </label>
              <select
                id="admin-user-role"
                className="input-control"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="">全部角色</option>
                <option value="USER">普通用户</option>
                <option value="ADMIN">管理员</option>
              </select>
            </div>
          </div>

          <div className="row" style={{ marginBottom: "1rem" }}>
            <div className="field">
              <label className="label" htmlFor="admin-user-status">
                状态
              </label>
              <select
                id="admin-user-status"
                className="input-control"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">全部状态</option>
                <option value="ACTIVE">正常</option>
                <option value="DISABLED">已停用</option>
              </select>
            </div>
            <div className="field" style={{ justifyContent: "flex-end" }}>
              <label className="label" style={{ opacity: 0 }}>
                actions
              </label>
              <button type="button" className="btn btn-secondary" onClick={loadUsers}>
                刷新列表
              </button>
            </div>
          </div>

          {pageError && <div className="auth-feedback auth-feedback--error">{pageError}</div>}

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}>
              <div className="spinner" />
            </div>
          ) : (
            <div className="list" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {users.map((user) => (
                <div
                  key={user.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px minmax(0, 1fr)",
                    gap: "0.75rem",
                    alignItems: "start",
                    padding: "1rem",
                    borderRadius: "18px",
                    border:
                      user.id === selectedUserId
                        ? "1px solid rgba(20, 20, 19, 0.16)"
                        : "1px solid rgba(20, 20, 19, 0.08)",
                    background:
                      user.id === selectedUserId
                        ? "rgba(20, 20, 19, 0.04)"
                        : "rgba(255,255,255,0.96)",
                    boxShadow: selectedUserIdSet.has(user.id)
                      ? "inset 0 0 0 1px rgba(217, 119, 87, 0.18)"
                      : "none"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIdSet.has(user.id)}
                    onChange={() => toggleUserSelection(user.id)}
                    aria-label={`选择 ${user.email}`}
                    style={{ marginTop: "0.4rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      display: "block"
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "0.7rem" }}
                    >
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "999px",
                          background: "rgba(20,20,19,0.08)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700
                        }}
                      >
                        {getUserInitials(user.nickname || user.name, user.email)}
                      </div>
                      <div>
                        <strong style={{ display: "block", color: "var(--text-dark)" }}>
                          {user.nickname || user.name || user.email}
                        </strong>
                        <span style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>{user.email}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span className="tag">{getRoleLabel(user.role)}</span>
                      <span className="tag">{getStatusLabel(user.status)}</span>
                      <span className="tag">{getEffectiveVipLabel(user.vipType, user.vipExpiresAt)}</span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "1.75rem",
            borderRadius: "22px",
            background: "rgba(255,255,255,0.88)",
            border: "1px solid rgba(20, 20, 19, 0.08)",
            boxShadow: "0 12px 28px rgba(20, 20, 19, 0.05)"
          }}
        >
          {selectedUser ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ marginBottom: "0.35rem" }}>
                    {selectedUser.nickname || selectedUser.name || "未命名用户"}
                  </h2>
                  <p style={{ color: "rgba(20, 20, 19, 0.72)", marginBottom: 0 }}>{selectedUser.email}</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", height: "fit-content" }}>
                  <span className="tag">{getRoleLabel(selectedUser.role)}</span>
                  <span className="tag">{getStatusLabel(selectedUser.status)}</span>
                  <span className="tag">{getEffectiveVipLabel(selectedUser.vipType, selectedUser.vipExpiresAt)}</span>
                </div>
              </div>

              {detailError && <div className="auth-feedback auth-feedback--error">{detailError}</div>}
              {detailSuccess && (
                <div
                  style={{
                    marginBottom: "1rem",
                    padding: "0.9rem 1rem",
                    borderRadius: "14px",
                    background: "rgba(120, 140, 93, 0.1)",
                    color: "var(--accent-green)"
                  }}
                >
                  {detailSuccess}
                </div>
              )}

              <form onSubmit={handleSave}>
                <div className="row">
                  <div className="field">
                    <label className="label" htmlFor="admin-edit-role">
                      角色
                    </label>
                    <select
                      id="admin-edit-role"
                      className="input-control"
                      value={editState.role}
                      onChange={(event) => updateField("role", event.target.value)}
                    >
                      <option value="USER">普通用户</option>
                      <option value="ADMIN">管理员</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="admin-edit-status">
                      状态
                    </label>
                    <select
                      id="admin-edit-status"
                      className="input-control"
                      value={editState.status}
                      onChange={(event) => updateField("status", event.target.value)}
                    >
                      <option value="ACTIVE">正常</option>
                      <option value="DISABLED">已停用</option>
                    </select>
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label className="label" htmlFor="admin-edit-vip">
                      会员类型
                    </label>
                    <select
                      id="admin-edit-vip"
                      className="input-control"
                      value={editState.vipType}
                      onChange={(event) => updateField("vipType", event.target.value)}
                    >
                      {VIP_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="admin-edit-vip-expire">
                      会员到期
                    </label>
                    <input
                      id="admin-edit-vip-expire"
                      type="date"
                      className="input-control"
                      value={editState.vipExpiresAt}
                      disabled={editState.vipType === "none" || editState.vipType === "lifetime"}
                      onChange={(event) => updateField("vipExpiresAt", event.target.value)}
                    />
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label className="label" htmlFor="admin-edit-name">
                      姓名
                    </label>
                    <input
                      id="admin-edit-name"
                      className="input-control"
                      value={editState.name}
                      onChange={(event) => updateField("name", event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="admin-edit-nickname">
                      昵称
                    </label>
                    <input
                      id="admin-edit-nickname"
                      className="input-control"
                      value={editState.nickname}
                      onChange={(event) => updateField("nickname", event.target.value)}
                    />
                  </div>
                </div>

                <div className="field" style={{ marginBottom: "1.25rem" }}>
                  <label className="label" htmlFor="admin-edit-avatar">
                    头像地址
                  </label>
                  <input
                    id="admin-edit-avatar"
                    className="input-control"
                    value={editState.avatarUrl}
                    onChange={(event) => updateField("avatarUrl", event.target.value)}
                  />
                </div>

                <div
                  style={{
                    marginBottom: "1.25rem",
                    padding: "1rem 1.1rem",
                    borderRadius: "16px",
                    background: "rgba(20, 20, 19, 0.035)",
                    border: "1px solid rgba(20, 20, 19, 0.06)"
                  }}
                >
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    前台当前生效展示
                  </div>
                  <div style={{ fontWeight: 600, color: "var(--text-dark)" }}>
                    {editingMembership.effectiveLabel}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: "0.35rem" }}>
                    {editingMembership.summary}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.35rem" }}>
                    {editingMembership.expiresText}
                  </div>
                  <ul style={{ margin: "0.7rem 0 0", paddingLeft: "1.15rem", lineHeight: 1.7 }}>
                    {editingMembership.benefits.map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))}
                  </ul>
                </div>

                <div className="kvs" style={{ marginBottom: "1.5rem" }}>
                  <div className="kv">
                    <div className="k">最近登录</div>
                    <div className="v">{formatDateTime(selectedUser.lastLoginAt)}</div>
                  </div>
                  <div className="kv">
                    <div className="k">创建时间</div>
                    <div className="v">{formatDateTime(selectedUser.createdAt)}</div>
                  </div>
                  <div className="kv">
                    <div className="k">最后更新</div>
                    <div className="v">{formatDateTime(selectedUser.updatedAt)}</div>
                  </div>
                  <div className="kv">
                    <div className="k">当前生效会员</div>
                    <div className="v">{getEffectiveVipLabel(selectedUser.vipType, selectedUser.vipExpiresAt)}</div>
                  </div>
                </div>

                <div
                  style={{
                    marginBottom: "1.5rem",
                    padding: "1rem 1.1rem",
                    borderRadius: "16px",
                    background: "rgba(20, 20, 19, 0.035)",
                    border: "1px solid rgba(20, 20, 19, 0.06)"
                  }}
                >
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    当前生效权益快照
                  </div>
                  <div style={{ fontWeight: 600, color: "var(--text-dark)", marginBottom: "0.35rem" }}>
                    {selectedMembership.effectiveLabel}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginBottom: "0.7rem" }}>
                    {selectedMembership.expiresText}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.15rem", lineHeight: 1.7 }}>
                    {selectedMembership.benefits.map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))}
                  </ul>
                </div>

                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "保存中..." : "保存用户信息"}
                </button>
              </form>
            </>
          ) : (
            <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--text-muted)" }}>
              暂无匹配用户
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
