$(document).ready(function () {
    $('body').on('click', function (e) {
        // $('.left_project_menue_icon').hover(function (e) {
        if (e.target.id === 'links_block' || e.target.className === 'ti-plus') {
        } else {
            $('.lpm').hide();
        }
    });

    $('.left_project_menue_icon').on('click', function (e) {
    // $('.left_project_menue_icon').hover(function (e) {
        $('.lpm').toggle();
    });
    var collapse = document.getElementsByClassName("sidebar_collapsible");
    var i;
    for (i = 0; i < collapse.length; i++) {
        collapse[i].addEventListener("click", function () {
            var root = this;
            $('.sidebar_collapsible').each(
                function () {
                    if ($(this).hasClass('active') && root != this && !$(this).hasClass('nested_tab')) {
                        this.classList.toggle('active');
                        if (this.nextElementSibling.style.display === "block") {
                            this.nextElementSibling.style.display = "none";
                        }
                    }
                }
            );
            if ($(this).hasClass('active')) {
                $(this).removeClass('active');
                root.nextElementSibling.style.display = "none";
            } else {
                $(this).addClass('active');
                root.nextElementSibling.style.display = "block";
            }
        });
    }
});

function default_active_nav(selector) {
    $(selector).addClass('active');
    $(selector).next()[0].style.display = "block";
}

