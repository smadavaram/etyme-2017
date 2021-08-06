class AddPhoneCountryCodeToCandidates < ActiveRecord::Migration[5.2]
  def change
    add_column :candidates, :phone_country_code, :string
  end
end
