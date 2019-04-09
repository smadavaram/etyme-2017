class AddOnbordingStepsToCandidates < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :candidates, :is_number_verify, :boolean, :default=> false
    add_column :candidates, :is_personal_info_update, :boolean, :default=> false
    add_column :candidates, :is_social_media, :boolean, :default=> false
    add_column :candidates, :is_education_detail_update, :boolean, :default=> false
    add_column :candidates, :is_skill_update, :boolean, :default=> false
    add_column :candidates, :is_client_info_update, :boolean, :default=> false
    add_column :candidates, :is_designate_update, :boolean, :default=> false
    add_column :candidates, :is_documents_submit, :boolean, :default=> false
    add_column :candidates, :is_profile_active, :boolean, :default=> false
  end
end
