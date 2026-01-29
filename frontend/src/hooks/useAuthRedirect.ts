import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

/**
 * Returns a handler for API responses. If the response is 401,
 * logs out and redirects to login, and returns true; otherwise returns false.
 * Use to avoid repeating logout/navigate("/login") in every API call.
 */
export function useAuthRedirect(): (response: Response) => boolean {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (response: Response): boolean => {
    if (response.status === 401) {
      logout();
      navigate("/login");
      return true;
    }
    return false;
  };
}
