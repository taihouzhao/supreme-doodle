import { Session } from "./session";
import { View } from "./view";

const root = document.getElementById("app");
if (!root) throw new Error("缺少 #app 挂载点");

const session = new Session();
const view = new View(root, session);
session.subscribe((state) => view.render(state));
session.onVisual(() => view.renderBoard());
