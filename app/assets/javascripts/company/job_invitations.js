$(document).ready(function() {
    $('#receive_job_active').click(function() {
        $('#receive_job_active').addClass('active');
        $('#sent_job_active').removeClass('active');

    });
    $('#sent_job_active').click(function() {
        $('#sent_job_active').addClass('active');
        $('#receive_job_active').removeClass('active');
    });
});
