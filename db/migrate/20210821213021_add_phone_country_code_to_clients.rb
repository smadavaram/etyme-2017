class AddPhoneCountryCodeToClients < ActiveRecord::Migration[5.2]
  def change
    add_column :clients, :refrence_phone_country_code, :string
    add_column :clients, :refrence_two_phone_country_code, :string
  end
end
