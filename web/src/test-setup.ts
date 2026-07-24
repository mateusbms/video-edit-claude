import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Sem globals:true, o React Testing Library não registra cleanup automático;
// sem isto, renders de testes anteriores vazam no document.body.
afterEach(cleanup);
