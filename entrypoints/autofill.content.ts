export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main(ctx) {
    interface MatchingAccount {
      id: number;
      username: string;
      password?: string;
    }

    interface MatchingBookmark {
      bookmarkId: string;
      name: string;
      accounts: MatchingAccount[];
    }

    interface AuthStatusResponse {
      locked: boolean;
    }

    interface MatchingBookmarksResponse {
      bookmarks: MatchingBookmark[];
    }

    interface GeneratedPasswordMessage {
      type: "FILL_GENERATED_PASSWORD";
      password: string;
    }

    interface AccountChoice {
      bookmarkId: string;
      bookmarkName: string;
      account: MatchingAccount;
    }

    interface IconHandle {
      host: HTMLDivElement;
      button: HTMLButtonElement;
      passwordField: HTMLInputElement;
      clickHandler: (event: MouseEvent) => void;
    }

    interface DropdownHandle {
      host: HTMLDivElement;
      onOutsideClick: (event: MouseEvent) => void;
      onEscape: (event: KeyboardEvent) => void;
    }

    const iconHandles = new Map<HTMLInputElement, IconHandle>();
    let activeDropdown: DropdownHandle | null = null;
    let mutationObserver: MutationObserver | null = null;
    let debounceTimer: number | null = null;

    /**
     * 安全发送消息到后台脚本。
     */
    async function sendRuntimeMessage<TResponse>(payload: unknown): Promise<TResponse | null> {
      try {
        const response = await browser.runtime.sendMessage(payload);
        return response as TResponse;
      }
      catch {
        return null;
      }
    }

    /**
     * 判断输入框是否可见且可交互。
     */
    function isVisibleInput(input: HTMLInputElement): boolean {
      if (!input.isConnected) {
        return false;
      }

      if (input.type.toLowerCase() === "hidden") {
        return false;
      }

      const style = window.getComputedStyle(input);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      if (input.offsetParent === null && style.position !== "fixed") {
        return false;
      }

      const rect = input.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      return true;
    }

    /**
     * 判断字段是否处于搜索区域。
     */
    function isInSearchContext(element: HTMLElement): boolean {
      const searchRoleContainer = element.closest('[role="search"]');
      if (searchRoleContainer) {
        return true;
      }

      const form = element.closest("form");
      const action = form?.getAttribute("action") ?? "";
      return action.toLowerCase().includes("search");
    }

    /**
     * 获取当前页面所有可见密码输入框。
     */
    function getVisiblePasswordFields(): HTMLInputElement[] {
      const passwordFields = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));
      return passwordFields.filter((field) => isVisibleInput(field) && !isInSearchContext(field));
    }

    /**
     * 依据启发式选择最合适的用户名字段。
     */
    function chooseBestUsernameCandidate(passwordField: HTMLInputElement, candidates: HTMLInputElement[]): HTMLInputElement | null {
      if (candidates.length === 0) {
        return null;
      }

      const byAutocomplete = candidates.find((candidate) => candidate.autocomplete.toLowerCase() === "username");
      if (byAutocomplete) {
        return byAutocomplete;
      }

      const precedingCandidates = candidates.filter((candidate) => {
        const relation = candidate.compareDocumentPosition(passwordField);
        return (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });

      if (precedingCandidates.length > 0) {
        return precedingCandidates[precedingCandidates.length - 1] ?? null;
      }

      return candidates[0] ?? null;
    }

    /**
     * 在给定容器内查找可见用户名候选字段。
     */
    function findUsernameCandidates(scope: ParentNode, passwordField: HTMLInputElement): HTMLInputElement[] {
      const selector = [
        'input[type="email"]',
        'input[type="text"]',
        'input[name*="user" i]',
        'input[name*="email" i]',
        'input[name*="login" i]',
        'input[autocomplete="username"]',
      ].join(",");

      const candidates = Array.from(scope.querySelectorAll<HTMLInputElement>(selector));
      return candidates.filter((candidate) => {
        if (candidate === passwordField) {
          return false;
        }

        if (!isVisibleInput(candidate)) {
          return false;
        }

        if (isInSearchContext(candidate)) {
          return false;
        }

        return true;
      });
    }

    /**
     * 按规则为密码字段寻找对应用户名字段。
     */
    function findUsernameField(passwordField: HTMLInputElement): HTMLInputElement | null {
      const form = passwordField.closest("form");
      if (form && !isInSearchContext(passwordField)) {
        const inFormCandidates = findUsernameCandidates(form, passwordField);
        const selectedInForm = chooseBestUsernameCandidate(passwordField, inFormCandidates);
        if (selectedInForm) {
          return selectedInForm;
        }
      }

      let ancestor: HTMLElement | null = passwordField.parentElement;
      while (ancestor) {
        const scopedCandidates = findUsernameCandidates(ancestor, passwordField);
        if (scopedCandidates.length > 0) {
          const selectedInAncestor = chooseBestUsernameCandidate(passwordField, scopedCandidates);
          if (selectedInAncestor) {
            return selectedInAncestor;
          }
        }
        ancestor = ancestor.parentElement;
      }

      const globalCandidates = findUsernameCandidates(document, passwordField);
      return chooseBestUsernameCandidate(passwordField, globalCandidates);
    }

    /**
     * 设置字段值并触发前端框架所需事件。
     */
    function setFieldValue(field: HTMLInputElement, value: string): void {
      field.focus();
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /**
     * 读取鉴权状态，锁定时禁用自动填充。
     */
    async function isUnlocked(): Promise<boolean> {
      const auth = await sendRuntimeMessage<AuthStatusResponse>({ type: "GET_AUTH_STATUS" });
      return Boolean(auth && !auth.locked);
    }

    /**
     * 按当前 URL 获取可匹配书签列表。
     */
    async function getMatchingBookmarks(): Promise<MatchingBookmark[]> {
      const unlocked = await isUnlocked();
      if (!unlocked) {
        return [];
      }

      const response = await sendRuntimeMessage<MatchingBookmarksResponse>({
        type: "GET_MATCHING_BOOKMARKS",
        url: window.location.href,
      });

      return response?.bookmarks ?? [];
    }

    /**
     * 计算并设置图标位置（密码框右侧内部）。
     */
    function positionIcon(handle: IconHandle): void {
      const rect = handle.passwordField.getBoundingClientRect();
      const size = 20;
      const top = window.scrollY + rect.top + Math.max((rect.height - size) / 2, 0);
      const left = window.scrollX + rect.right - size - 4;

      handle.host.style.top = `${Math.round(top)}px`;
      handle.host.style.left = `${Math.round(left)}px`;
    }

    /**
     * 关闭账号选择下拉层。
     */
    function closeAccountDropdown(): void {
      if (!activeDropdown) {
        return;
      }

      document.removeEventListener("mousedown", activeDropdown.onOutsideClick, true);
      document.removeEventListener("keydown", activeDropdown.onEscape, true);
      activeDropdown.host.remove();
      activeDropdown = null;
    }

    /**
     * 执行用户名与密码填充，并上报使用记录。
     */
    async function fillCredentials(
      passwordField: HTMLInputElement,
      choice: AccountChoice,
    ): Promise<void> {
      const usernameField = findUsernameField(passwordField);
      const username = choice.account.username ?? "";
      const password = choice.account.password ?? "";

      if (usernameField && username) {
        setFieldValue(usernameField, username);
      }

      if (password) {
        setFieldValue(passwordField, password);
      }

      await sendRuntimeMessage<{ success: boolean }>({
        type: "MARK_AS_USED",
        bookmarkId: choice.bookmarkId,
        url: window.location.href,
        accountId: choice.account.id,
      });
    }

    /**
     * 通过 Shadow DOM 渲染账号下拉列表。
     */
    function showAccountDropdown(passwordField: HTMLInputElement, choices: AccountChoice[]): void {
      closeAccountDropdown();

      const rect = passwordField.getBoundingClientRect();
      const host = document.createElement("div");
      host.style.position = "absolute";
      host.style.left = `${Math.round(window.scrollX + rect.left)}px`;
      host.style.top = `${Math.round(window.scrollY + rect.bottom + 6)}px`;
      host.style.zIndex = "2147483647";
      document.body.append(host);

      const shadowRoot = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        .keeper-dropdown {
          min-width: 220px;
          max-width: 320px;
          max-height: 200px;
          overflow-y: auto;
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 4px 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .keeper-item {
          padding: 8px 12px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .keeper-item:hover {
          background: #f0f7ff;
        }
        .keeper-bookmark {
          color: #666;
          font-size: 12px;
          line-height: 1.2;
        }
        .keeper-username {
          color: #111;
          font-size: 13px;
          line-height: 1.3;
          word-break: break-all;
        }
      `;

      const container = document.createElement("div");
      container.className = "keeper-dropdown";

      for (const choice of choices) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "keeper-item";

        const bookmark = document.createElement("span");
        bookmark.className = "keeper-bookmark";
        bookmark.textContent = choice.bookmarkName;

        const username = document.createElement("span");
        username.className = "keeper-username";
        username.textContent = choice.account.username;

        item.append(bookmark, username);
        item.addEventListener("click", async () => {
          closeAccountDropdown();
          await fillCredentials(passwordField, choice);
        });

        container.append(item);
      }

      shadowRoot.append(style, container);

      const onOutsideClick = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) {
          return;
        }

        const composedPath = event.composedPath();
        if (composedPath.includes(host)) {
          return;
        }

        closeAccountDropdown();
      };

      const onEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          closeAccountDropdown();
        }
      };

      document.addEventListener("mousedown", onOutsideClick, true);
      document.addEventListener("keydown", onEscape, true);
      activeDropdown = { host, onOutsideClick, onEscape };
    }

    /**
     * 创建并注入密码框旁的 Keeper 快捷图标。
     */
    function createKeeperIcon(passwordField: HTMLInputElement): IconHandle {
      const host = document.createElement("div");
      host.style.position = "absolute";
      host.style.width = "20px";
      host.style.height = "20px";
      host.style.zIndex = "2147483646";
      host.style.pointerEvents = "auto";
      document.body.append(host);

      const shadowRoot = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        .keeper-icon {
          width: 20px;
          height: 20px;
          border: 0;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          padding: 0;
          line-height: 20px;
          text-align: center;
          font-size: 13px;
          opacity: 0.7;
          transition: opacity 120ms ease;
        }
        .keeper-icon:hover {
          opacity: 1;
        }
      `;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "keeper-icon";
      button.setAttribute("aria-label", "Keeper autofill");
      button.textContent = "🔑";

      shadowRoot.append(style, button);

      const clickHandler = async (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const bookmarks = await getMatchingBookmarks();
        if (bookmarks.length === 0) {
          closeAccountDropdown();
          return;
        }

        const choices: AccountChoice[] = [];
        for (const bookmark of bookmarks) {
          for (const account of bookmark.accounts) {
            choices.push({
              bookmarkId: bookmark.bookmarkId,
              bookmarkName: bookmark.name,
              account,
            });
          }
        }

        if (choices.length === 0) {
          closeAccountDropdown();
          return;
        }

        if (choices.length === 1) {
          closeAccountDropdown();
          await fillCredentials(passwordField, choices[0]);
          return;
        }

        showAccountDropdown(passwordField, choices);
      };

      button.addEventListener("click", clickHandler);

      const handle: IconHandle = {
        host,
        button,
        passwordField,
        clickHandler,
      };

      positionIcon(handle);
      return handle;
    }

    /**
     * 扫描页面并为可用密码框挂载图标。
     */
    async function scanAndInjectIcons(): Promise<void> {
      const unlocked = await isUnlocked();
      if (!unlocked) {
        for (const [field, handle] of iconHandles) {
          handle.button.removeEventListener("click", handle.clickHandler);
          handle.host.remove();
          iconHandles.delete(field);
        }
        closeAccountDropdown();
        return;
      }

      const passwordFields = getVisiblePasswordFields();
      const currentSet = new Set(passwordFields);

      for (const [field, handle] of iconHandles) {
        if (!currentSet.has(field) || !field.isConnected) {
          handle.button.removeEventListener("click", handle.clickHandler);
          handle.host.remove();
          iconHandles.delete(field);
        }
      }

      for (const passwordField of passwordFields) {
        const existing = iconHandles.get(passwordField);
        if (existing) {
          positionIcon(existing);
          continue;
        }

        const handle = createKeeperIcon(passwordField);
        iconHandles.set(passwordField, handle);
      }

      if (activeDropdown && !document.contains(activeDropdown.host)) {
        closeAccountDropdown();
      }
    }

    /**
     * 防抖触发重扫，适配 SPA 动态渲染。
     */
    function scheduleScan(): void {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }

      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void scanAndInjectIcons();
      }, 500);
    }

    /**
     * 处理后台下发的生成密码填充消息。
     */
    const onRuntimeMessage = (message: unknown) => {
      if (!message || typeof message !== "object") {
        return;
      }

      const payload = message as Partial<GeneratedPasswordMessage>;
      if (payload.type !== "FILL_GENERATED_PASSWORD" || typeof payload.password !== "string") {
        return;
      }

      const activeElement = document.activeElement;
      const targetField =
        activeElement instanceof HTMLInputElement &&
        activeElement.type.toLowerCase() === "password" &&
        isVisibleInput(activeElement)
          ? activeElement
          : getVisiblePasswordFields()[0] ?? null;

      if (!targetField) {
        return;
      }

      setFieldValue(targetField, payload.password);
    };

    browser.runtime.onMessage.addListener(onRuntimeMessage);

    const onViewportChange = () => {
      for (const handle of iconHandles.values()) {
        positionIcon(handle);
      }
      if (activeDropdown) {
        closeAccountDropdown();
      }
    };

    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);

    mutationObserver = new MutationObserver(() => {
      scheduleScan();
    });

    if (document.body) {
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    void scanAndInjectIcons();

    ctx.onInvalidated(() => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      mutationObserver?.disconnect();
      mutationObserver = null;

      closeAccountDropdown();

      for (const handle of iconHandles.values()) {
        handle.button.removeEventListener("click", handle.clickHandler);
        handle.host.remove();
      }
      iconHandles.clear();

      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);

      browser.runtime.onMessage.removeListener(onRuntimeMessage);
    });
  },
});
