$('#job_invitation').html("<%= j render('static/job_applications/partials/job_application_modal' , job: @job , job_application: @job_application ) %>");
alert('abc');
$('#job-invite-<%=@job.id %>').modal('show');
alert('abc');
//tinymce.init({
//    selector: '.r#{@job.id}',
//    menubar: false ,
//    plugins: 'image table link paste contextmenu textpattern autolink',
//    insert_toolbar: 'quicktable',
//    selection_toolbar: 'bold italic | quicklink h2 h3 blockquote'
//  });
