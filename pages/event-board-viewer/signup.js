function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function initializeSignup() {
  const {
  data: { session }
} = await window.supabaseClient.auth.getSession();

if (!session) {
  alert("招待リンクが無効か期限切れです");
  return;
}

  console.log(session);
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const submitButton = document.querySelector(".submit");

  emailInput.value = session.user.email;
  emailInput.readOnly = true;


  submitButton.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      alert("メールアドレスとパスワードを入力してください。");
      return;
    }


    const { data, error } = await window.supabaseClient.auth.updateUser({
    password
    });

    if (error) {
      alert("パスワードの登録に失敗しました：" + error.message);
      return;
    }

    alert("招待登録が完了しました。ログインページへ移動します。");
    window.location.href = "login.html";
    return;

    alert(
      "サインアップが完了しました。招待メールのアドレスでログインするか、確認メールをチェックしてください。"
    );
    window.location.href = "login.html";
  });
}

window.addEventListener("DOMContentLoaded", initializeSignup);