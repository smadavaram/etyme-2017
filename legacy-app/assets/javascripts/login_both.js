$(document).ready(function() {
  var formId = 'register-form';
  $('#business_login_both_option').click(function() {
    $('a#forgot_password_login_both').attr('href', '/users/password/new');
    $('a#sign_up_login_both').attr('href', '/register');
    $('#' + formId).attr('action', '/users/login');
  });

  $('#candidate_login_both_option').click(function() {
    $('a#forgot_password_login_both').attr('href', '/candidates/password/new');
    $('a#sign_up_login_both').attr('href', '/candidates/sign_up');
    $('#' + formId).attr('action', 'candidates/sign_in');
  });

  $("span.toggle-password").click(function() {
    let temp = document.getElementById("pass");
    let toggleIcon = document.querySelector(".toggle-password i");

    if (temp.type === "password") {
        temp.type = "text";
        toggleIcon.classList.remove("fa-eye-slash");
        toggleIcon.classList.add("fa-eye");
    }
    else {
        temp.type = "password";
        toggleIcon.classList.remove("fa-eye");
        toggleIcon.classList.add("fa-eye-slash");
    }
})
});
