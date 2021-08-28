class AddRecruiterPhoneCountryCodeToDesignations < ActiveRecord::Migration[5.2]
  def change
    add_column :designations, :recruiter_phone_country_code, :string
  end
end
