class AddRecruiterReferenceToDesignation < ActiveRecord::Migration[5.2]
  def change
    add_column :client_references, :recruiter_name, :string
    add_column :client_references, :recruiter_phone, :string
    add_column :client_references, :recruiter_email, :string
    add_column :client_references, :recruiter_phone_country_code, :string
  end
end
