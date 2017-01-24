$('#job_invitation').html("<%= j render('company/job_invitations/partials/accept_job_invitation_modal' , job: @job_invitation.job , job_application: @job_application , accept_state: true , job_invitation: @job_invitation)%>");


tinymce.init({
    selector: '.r<%= @job_invitation.id %>',
    menubar: false ,
    plugins: 'image table link paste contextmenu textpattern autolink',
    insert_toolbar: 'quicktable',
    selection_toolbar: 'bold italic | quicklink h2 h3 blockquote'
});
var element = $('#accept-filepiker')
filepicker.constructWidget(element)

$( ".file-pick" ).on('click',function() {

    $('.fp__overlay').css({'z-index':'99999'});
});
$('#job-invite-<%= @job_invitation.id %>').modal();