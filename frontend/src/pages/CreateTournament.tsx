import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../WorkspaceContext";

/**
 * This page has been replaced by an inline dialog on the Tournaments list.
 * Redirect any direct navigations (bookmarks, Header links not yet updated) there.
 */
const CreateTournament: React.FC = () => {
  const navigate = useNavigate();
  const { wPath } = useWorkspace();

  useEffect(() => {
    navigate(wPath("/tournaments"), { replace: true, state: { openCreate: true } });
  }, [navigate, wPath]);

  return null;
};

export default CreateTournament;
