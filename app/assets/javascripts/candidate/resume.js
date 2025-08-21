function uploadResume(url,type){
    resume_url = url
    $.ajax({
        type: 'POST',
        url: "/candidate/upload_resume.js ",
        data: { resume: resume_url,authenticity_token: window._token },
    });
}
function upload_resume_file_in_slick(){
    upload_file_ajax(uploadResume);
}