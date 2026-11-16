// OPC 云端接入层：在 app.js 后加载。学生免登录，管理员使用服务器密码。
(() => {
  const cloudCache = {};
  const currentWeek = WK.key;
  const tokenKey = "opc-admin-session";
  let adminToken = sessionStorage.getItem(tokenKey) || "";
  let currentRequest = 0;
  const oldRenderAdmin = renderAdmin;
  const oldSwitchRole = switchRole;

  // 不再把真实周报写入浏览器 localStorage。
  store.get = () => cloudCache;
  store.set = () => {};
  renderHistory = function () {
    const area = document.getElementById("my-history");
    if (area)
      area.textContent =
        "周报提交后保存在云端。为保护其他团队的信息，学生端不提供免登录历史详情查询；如需核对请联系管理员。";
  };

  async function api(path, opts = {}) {
    const response = await fetch(path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      cache: "no-store",
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error("服务器返回的内容不是 JSON");
    }
    if (!response.ok)
      throw Error(data.error || `服务器错误 ${response.status}`);
    return data;
  }

  async function loadStatus(team) {
    const id = ++currentRequest;
    try {
      const status = await api(
        `/api/reports/status?team=${encodeURIComponent( team )}&week=${encodeURIComponent(currentWeek)}`
      );
      if (id !== currentRequest || team !== currentTeam) return;
      cloudCache[currentWeek] = cloudCache[currentWeek] || {};
      cloudCache[currentWeek][team] = {
        ...(status.plan ? { plan: { at: "云端已保存" } } : {}),
        ...(status.progress
          ? { progress: { at: "云端已保存", p1: 0, p2: 0 } }
          : {}),
      };
      renderWeekBanner();
    } catch (err) {
      toast(`未能读取提交状态：${err.message}`);
    }
  }

  pickTeam = function (team) {
    if (!TEAMS.includes(team)) return;
    currentTeam = team;
    renderChips();
    renderWeekBanner();
    loadStatus(team);
  };

  submitForm = async function (type) {
    if (!currentTeam || !TEAMS.includes(currentTeam)) {
      toast("请先选择团队");
      return;
    }
    let report_data;
    if (type === "plan") {
      report_data = {
        tasks: document.getElementById("plan-tasks").value.trim(),
        goal: document.getElementById("plan-goal").value.trim(),
        need: document.getElementById("plan-need").value.trim(),
      };
      if (!report_data.tasks) {
        toast("请填写本周核心任务");
        return;
      }
    } else if (type === "progress") {
      report_data = {
        p1: Number(document.getElementById("prog-p1").value),
        p2: Number(document.getElementById("prog-p2").value),
        result: document.getElementById("prog-result").value.trim(),
        delay: document.getElementById("prog-delay").value.trim(),
      };
      if (!report_data.result) {
        toast("请填写实际成果与亮点");
        return;
      }
      if (
        ![report_data.p1, report_data.p2].every(
          (n) => Number.isInteger(n) && n >= 0 && n <= 100
        )
      ) {
        toast("任务完成度必须是0到100之间的整数");
        return;
      }
    } else return;
    const button = document.querySelector(
      type === "plan"
        ? "button[onclick=\"submitForm('plan')\"]"
        : "button[onclick=\"submitForm('progress')\"]"
    );
    if (button) button.disabled = true;
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          team_id: currentTeam,
          week_key: currentWeek,
          report_type: type,
          report_data,
        }),
      });
      const area = (cloudCache[currentWeek] ||= {});
      area[currentTeam] ||= {};
      area[currentTeam][type] = { ...report_data, at: "云端已保存" };
      if (type === "plan")
        ["plan-tasks", "plan-goal", "plan-need"].forEach(
          (id) => (document.getElementById(id).value = "")
        );
      else
        ["prog-p1", "prog-p2", "prog-result", "prog-delay"].forEach(
          (id) => (document.getElementById(id).value = "")
        );
      renderWeekBanner();
      toast("已成功提交到云端数据库");
    } catch (err) {
      toast(`提交失败：${err.message}，请保留填写内容重试`);
    } finally {
      if (button) button.disabled = false;
    }
  };

  async function loadAdmin() {
    if (!adminToken) return;
    try {
      const data = await api(
        `/api/admin/reports?week=${encodeURIComponent(currentWeek)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      cloudCache[currentWeek] = {};
      for (const row of data.reports) {
        cloudCache[currentWeek][row.team_id] ||= {};
        const d = row.report_data;
        cloudCache[currentWeek][row.team_id][row.report_type] = {
          ...d,
          at: row.updated_at || row.submitted_at,
        };
      }
      oldRenderAdmin();
    } catch (err) {
      if (/登录|401|过期/.test(err.message)) {
        adminToken = "";
        sessionStorage.removeItem(tokenKey);
        oldSwitchRole("team");
        toast("管理员登录已失效，请重新登录");
      } else toast(`管理数据读取失败：${err.message}`);
    }
  }

  renderAdmin = function () {
    oldRenderAdmin();
  };
  switchRole = function (next) {
    if (next === "admin" && !adminToken) {
      askAdminPass();
      return;
    }
    if (next === "team" && role === "admin") {
      adminToken = "";
      sessionStorage.removeItem(tokenKey);
      cloudCache[currentWeek] = {};
    }
    oldSwitchRole(next);
    if (next === "admin") loadAdmin();
    else loadStatus(currentTeam);
  };
  checkPass = async function () {
    const field = document.getElementById("admin-pass");
    if (!field) return;
    const password = field.value;
    if (!password) {
      toast("请输入管理密码");
      return;
    }
    try {
      const data = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      adminToken = data.token;
      sessionStorage.setItem(tokenKey, adminToken);
      document.getElementById("modal-root").innerHTML = "";
      oldSwitchRole("admin");
      await loadAdmin();
      toast("已进入云端管理后台");
    } catch (err) {
      field.value = "";
      toast(err.message);
    }
  };

  // 导出的是从 D1 查询的云端数据，不是演示数据。
  exportCSV = function () {
    if (role !== "admin" || !adminToken) {
      toast("请先登录管理员");
      return;
    }
    const rows = [
      [
        "团队",
        "周次",
        "类型",
        "首次提交时间",
        "最近修改时间",
        "核心任务",
        "预期目标",
        "支持需求",
        "任务1完成度",
        "任务2完成度",
        "实际成果",
        "未完成原因",
      ],
    ];
    const data = cloudCache[currentWeek] || {};
    for (const team of TEAMS) {
      const r = data[team] || {};
      if (r.plan)
        rows.push([
          team,
          currentWeek,
          "周计划",
          "",
          r.plan.at || "",
          r.plan.tasks || "",
          r.plan.goal || "",
          r.plan.need || "",
          "",
          "",
          "",
          "",
        ]);
      if (r.progress)
        rows.push([
          team,
          currentWeek,
          "周进度",
          "",
          r.progress.at || "",
          "",
          "",
          "",
          r.progress.p1,
          r.progress.p2,
          r.progress.result || "",
          r.progress.delay || "",
        ]);
    }
    const safe = (v) => {
      let s = String(v ?? "");
      if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = "\uFEFF" + rows.map((r) => r.map(safe).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
    link.download = `OPC云端周报_${currentWeek}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast("已导出云端周报");
  };
  editAgain = function (type) {
    const record = cloudCache[currentWeek]?.[currentTeam]?.[type];
    if (
      !record ||
      (type === "plan" && !record.tasks) ||
      (type === "progress" && !record.result)
    ) {
      toast("需要重新填写时，请在表单中输入新内容并提交，将覆盖原记录");
      return;
    }
    if (type === "plan") {
      document.getElementById("plan-tasks").value = record.tasks;
      document.getElementById("plan-goal").value = record.goal || "";
      document.getElementById("plan-need").value = record.need || "";
    } else {
      document.getElementById("prog-p1").value = record.p1;
      document.getElementById("prog-p2").value = record.p2;
      document.getElementById("prog-result").value = record.result;
      document.getElementById("prog-delay").value = record.delay || "";
    }
  };
  // 原型的模拟数据与假催办在正式系统中禁用。
  seedDemo = () => toast("正式系统已关闭模拟数据");
  remindLate = () => toast("催办功能尚未接入，请按未交名单联系团队");
  document.querySelectorAll(".toolbar button").forEach((btn) => {
    if (/模拟|一键催办/.test(btn.textContent || "")) btn.style.display = "none";
  });
  renderWeekBanner();
  loadStatus(currentTeam);
})();
