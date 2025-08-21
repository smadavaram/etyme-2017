ActiveAdmin.register Candidate do

  index do
    id_column
    column :first_name
    column :last_name
    column :email
    column :phone
    column :status
    column :created_at
    column :updated_at
    actions
  end

  # See permitted parameters documentation:
  # https://github.com/activeadmin/activeadmin/blob/master/docs/2-resource-customization.md#setting-up-strong-parameters
  #
  # Uncomment all parameters which should be permitted for assignment
  #
  # permit_params :first_name, :last_name, :gender, :email, :phone, :time_zone, :primary_address_id, :photo, :signature, :status, :dob, :encrypted_password, :reset_password_token, :reset_password_sent_at, :remember_created_at, :sign_in_count, :current_sign_in_at, :last_sign_in_at, :current_sign_in_ip, :last_sign_in_ip, :confirmation_token, :confirmed_at, :confirmation_sent_at, :unconfirmed_email, :invitation_token, :invitation_created_at, :invitation_sent_at, :invitation_accepted_at, :invitation_limit, :invited_by_type, :invited_by_id, :invitations_count, :resume, :skills, :description, :visa, :location, :video, :category, :subcategory, :dept_name, :industry_name, :video_type, :chat_status, :is_number_verify, :is_personal_info_update, :is_social_media, :is_education_detail_update, :is_skill_update, :is_client_info_update, :is_designate_update, :is_documents_submit, :is_profile_active, :selected_from_resume, :ever_worked_with_company, :designation_status, :candidate_visa, :candidate_title, :candidate_roal, :facebook_url, :twitter_url, :linkedin_url, :skypeid, :gtalk_url, :address, :company_id, :passport_number, :ssn, :relocation, :work_authorization, :visa_type, :latitude, :longitude, :skill_list, :designate_list
  #
  # or
  #
  permit_params do
    permitted = [:first_name, :last_name, :gender, :email, :phone, :time_zone, :primary_address_id, :photo, :signature, :status, :dob, :encrypted_password, :reset_password_token, :reset_password_sent_at, :remember_created_at, :sign_in_count, :current_sign_in_at, :last_sign_in_at, :current_sign_in_ip, :last_sign_in_ip, :confirmation_token, :confirmed_at, :confirmation_sent_at, :unconfirmed_email, :invitation_token, :invitation_created_at, :invitation_sent_at, :invitation_accepted_at, :invitation_limit, :invited_by_type, :invited_by_id, :invitations_count, :resume, :skills, :description, :visa, :location, :video, :category, :subcategory, :dept_name, :industry_name, :video_type, :chat_status, :is_number_verify, :is_personal_info_update, :is_social_media, :is_education_detail_update, :is_skill_update, :is_client_info_update, :is_designate_update, :is_documents_submit, :is_profile_active, :selected_from_resume, :ever_worked_with_company, :designation_status, :candidate_visa, :candidate_title, :candidate_roal, :facebook_url, :twitter_url, :linkedin_url, :skypeid, :gtalk_url, :address, :company_id, :passport_number, :ssn, :relocation, :work_authorization, :visa_type, :latitude, :longitude, :skill_list, :designate_list]
    permitted << :other if params[:action] == 'create' && current_user.admin?
    permitted
  end

end
