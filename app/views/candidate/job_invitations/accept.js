$('#job_invitation').html("<%= j render('candidate/job_invitations/partials/accept_job_invitation_modal' , job: @job_invitation.job , job_application: @job_application , accept_state: true , job_invitation: @job_invitation)%>");


tinymce.init({
  selector: '.r<%= @job_invitation.id %>',
  menubar: false ,
  plugins: 'image table link paste contextmenu textpattern autolink',
  insert_toolbar: 'quicktable',
  selection_toolbar: 'bold italic | quicklink h2 h3 blockquote'
});

$('#job-invite-<%= @job_invitation.id %>').modal();