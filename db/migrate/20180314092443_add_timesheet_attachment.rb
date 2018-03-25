class AddTimesheetAttachment < ActiveRecord::Migration[5.1]
  def change
    add_column :timesheets, :timesheet_attachment, :string
    add_column :timesheets, :candidate_name, :string
    add_column :timesheets, :candidate_id, :integer, index: true

    remove_column :contract_buy_business_details, :contact_name, :string
    remove_column :contract_buy_business_details, :phone, :string
    remove_column :contract_buy_business_details, :email, :string
    remove_column :contract_buy_business_details, :department, :string

    remove_column :contract_sell_business_details, :contact_name, :string
    remove_column :contract_sell_business_details, :phone, :string
    remove_column :contract_sell_business_details, :email, :string
    remove_column :contract_sell_business_details, :department, :string

    add_column :contract_buy_business_details, :company_contact_id, :integer, index: true
    add_column :contract_sell_business_details, :company_contact_id, :integer, index: true

    add_column :buy_contracts, :company_id, :integer, index: true
    add_column :company_contacts, :department, :string
  end
end
