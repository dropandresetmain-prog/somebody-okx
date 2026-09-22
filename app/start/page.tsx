import { ConvexClientProvider } from "../ConvexClientProvider";
import { StartContainer } from "./StartContainer";

// Production /start — dedicated V6 route (task §17). Provider scoped to this
// route segment only, same pattern as app/m5/layout.tsx.
export default function StartPage() {
  return (
    <ConvexClientProvider>
      <StartContainer />
    </ConvexClientProvider>
  );
}
