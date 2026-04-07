{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    npm.install.enable = true;
  };

  languages.typescript.enable = true;

  processes.vite.exec = "npm run dev";
  processes.api.exec = "npm run serve:watch";
}
