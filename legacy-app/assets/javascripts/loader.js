$(document).on('ready', function () {
    $(document).ajaxStart(function () {
        $('#load').css('visibility', 'visible');
    });

    $(document).ajaxComplete(function () {
        $('#load').css('visibility', 'hidden');
    });
});
