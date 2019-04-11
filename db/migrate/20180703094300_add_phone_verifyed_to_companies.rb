class AddPhoneVerifyedToCompanies < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :companies, :is_number_verify, :boolean, :default=> false
  end
end
