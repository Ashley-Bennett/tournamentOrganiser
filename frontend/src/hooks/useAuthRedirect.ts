import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

/**
 * Returns a stable handler for API responses. If the response is 401,
 * logs out and redirects to login, and returns true; otherwise returns false.
 * Memoized so it can be used in useCallback/useEffect deps without causing
 * unnecessary re-fetches.
 */
export function useAuthRedirect(): (response: Response) => boolean {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return useCallback(
    (response: Response): boolean => {
      if (response.status === 401) {
        logout();
        navigate("/login");
        return true;
      }
      return false;
    },
    [logout, navigate],
  );
}
