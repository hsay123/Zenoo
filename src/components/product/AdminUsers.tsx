"use client";

import { useState } from "react";
import { useAction, useAdminUsers } from "@/lib/api/live";
import { useSession } from "@/lib/api/session";
import { QueryView, InlineError, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader, Stat } from "@/components/product/WorkspaceHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "@/components/ui/icons";
import { formatDate } from "@/lib/utils/format";
import {
  adminUserSchema,
  platformPaths,
  userRoleSchema,
  type AdminUser,
} from "@/lib/api/platform";

const ROLES = userRoleSchema.options;

const controlClasses =
  "rounded-md border border-line-strong bg-surface px-3 py-1.5 text-body-sm text-ink transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 disabled:cursor-not-allowed disabled:bg-surface-muted";

/**
 * One account row.
 *
 * The role change is the real `PATCH /admin/users/{id}/role`. The select holds
 * a local draft until saved, so an accidental keystroke cannot reassign a user;
 * the API's guard against self-demotion surfaces inline rather than being
 * pre-empted in the UI.
 */
function UserRow({
  user,
  isSelf,
  onChanged,
}: {
  user: AdminUser;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const { run, pending, error } = useAction();
  const [role, setRole] = useState<AdminUser["role"]>(user.role);
  const dirty = role !== user.role;
  const selectId = `role-${user.id}`;

  const save = () =>
    void run(async (client) => {
      const updated = await client.patch(
        adminUserSchema,
        platformPaths.adminUserRole(user.id),
        { body: { role } },
      );
      onChanged();
      return updated;
    });

  return (
    <tr className="border-b border-line align-top last:border-b-0">
      <td className="px-5 py-3">
        <p className="text-ink">{user.email ?? "—"}</p>
        <p className="font-mono text-caption text-ink-4">
          {user.wallet_address ?? "no wallet"}
        </p>
      </td>
      <td className="px-5 py-3">
        <Badge tone={user.status === "active" ? "accent" : "neutral"}>
          {user.status}
        </Badge>
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={selectId} className="sr-only">
            Role for {user.email ?? user.id}
          </label>
          <select
            id={selectId}
            className={controlClasses}
            value={role}
            disabled={pending}
            onChange={(event) => setRole(event.target.value as AdminUser["role"])}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            disabled={!dirty || pending}
            onClick={save}
          >
            {pending ? "Saving…" : "Save role"}
          </Button>
        </div>
        {isSelf ? (
          <p className="mt-1.5 text-caption text-ink-4">
            This is your account — the API rejects demoting yourself.
          </p>
        ) : null}
        {error ? (
          <div className="mt-1.5">
            <InlineError error={error} />
          </div>
        ) : null}
      </td>
      <td className="px-5 py-3 text-ink-3">{formatDate(user.created_at)}</td>
    </tr>
  );
}

/**
 * Admin — user administration.
 *
 * Reads the real `GET /api/admin/users` (admin-only) and reassigns roles through
 * `PATCH /api/admin/users/{id}/role`. Nothing here is simulated: the list, the
 * filters and the role write all hit the platform API, and a non-admin never
 * reaches this screen or the underlying endpoints.
 */
export function AdminUsers() {
  const { user: me } = useSession();
  const [roleFilter, setRoleFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const filters: { role?: string; search?: string } = {};
  if (roleFilter) filters.role = roleFilter;
  if (search) filters.search = search;
  const users = useAdminUsers(filters);

  return (
    <>
      <WorkspaceHeader
        eyebrow="Admin"
        title="Users"
        description="Every account on the platform. A role change is applied immediately and takes effect on that account's next request."
      />

      <form
        className="flex flex-wrap items-end gap-3 pb-6"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="role-filter" className="text-body-sm font-medium text-ink">
            Role
          </label>
          <select
            id="role-filter"
            className={controlClasses}
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="">All roles</option>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="search-filter" className="text-body-sm font-medium text-ink">
            Search email
          </label>
          <input
            id="search-filter"
            type="search"
            className={controlClasses}
            value={searchInput}
            placeholder="name@example.com"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Search
        </Button>
      </form>

      <QueryView
        query={users}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={Users}
            title="No matching accounts"
            description="No account matches the current filters. Clear the role or email search to see everyone."
          />
        }
      >
        {(rows) => (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Accounts"
                value={String(rows.length)}
                hint="Matching the current filters"
              />
              <Stat
                label="Admins"
                value={String(rows.filter((row) => row.role === "admin").length)}
                hint="In the current result"
                tone="muted"
              />
              <Stat
                label="Not active"
                value={String(rows.filter((row) => row.status !== "active").length)}
                hint="Suspended or otherwise"
                tone="muted"
              />
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] border-collapse text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-line text-caption uppercase tracking-[0.05em] text-ink-4">
                      <th scope="col" className="px-5 py-3 font-medium">
                        Account
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Role
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <UserRow
                        key={row.id}
                        user={row}
                        isSelf={row.id === me.id}
                        onChanged={users.reload}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <InfoNote>
              Role changes write straight to the account record; there is no
              separate admin action log in this build. The platform&rsquo;s audit
              trail is the append-only review, appeal and payout-receipt record.
            </InfoNote>
          </>
        )}
      </QueryView>
    </>
  );
}
