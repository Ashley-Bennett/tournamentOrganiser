import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: "personal" | "club" | "store";
  created_by: string | null;
  created_at: string;
}

interface WorkspaceMember {
  role: "owner" | "admin" | "judge" | "staff";
  workspaces: Workspace;
}

interface WorkspaceContextType {
  /** The workspace currently identified by the URL slug */
  workspace: Workspace | null;
  workspaceId: string | null;
  /** All workspaces the user is a member of */
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  /** Navigate to a workspace-prefixed path within the current workspace */
  wPath: (path: string) => string;
  /** Redirect to the user's first workspace dashboard after login */
  redirectToDefaultWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined,
);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract workspace slug from URL: /w/:workspaceSlug/...
  const currentSlug = useMemo(() => {
    const match = /^\/w\/([^/]+)/.exec(location.pathname);
    return match?.[1] ?? null;
  }, [location.pathname]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }

    const fetchWorkspaces = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("workspace_memberships")
        .select("role, workspaces(id, name, slug, type, created_by, created_at)")
        .eq("user_id", user.id);

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const resolved = (data as unknown as WorkspaceMember[])
        .map((m) => m.workspaces)
        .filter(Boolean);

      setWorkspaces(resolved);
      setLoading(false);
    };

    void fetchWorkspaces();
  }, [user, authLoading]);

  const workspace = useMemo(() => {
    if (!currentSlug || workspaces.length === 0) return null;
    return workspaces.find((w) => w.slug === currentSlug) ?? null;
  }, [currentSlug, workspaces]);

  const workspaceId = workspace?.id ?? null;

  const wPath = useCallback(
    (path: string) => {
      if (!workspace) return path;
      return `/w/${workspace.slug}${path}`;
    },
    [workspace],
  );

  const redirectToDefaultWorkspace = useCallback(() => {
    if (workspaces.length > 0) {
      navigate(`/w/${workspaces[0].slug}/tournaments`);
    }
  }, [workspaces, navigate]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        workspaceId,
        workspaces,
        loading,
        error,
        wPath,
        redirectToDefaultWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- hook
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
