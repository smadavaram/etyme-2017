class ChangeInContract < ActiveRecord::Migration[4.2][5.1]
  def change
    remove_column :contracts, :client_name, :string
    remove_column :contracts, :candidate_name, :string
    remove_column :contracts, :customer_rate, :decimal
    remove_column :contracts, :invoice_terms_period, :string
    remove_column :contracts, :show_accounting_to_employee, :boolean
    remove_column :contracts, :b_ssn, :string
    remove_column :contracts, :buy_company_id, :integer, index: true
    remove_column :contracts, :payrate, :decimal
    remove_column :contracts, :b_time_sheet, :string
    remove_column :contracts, :payment_term, :string
    remove_column :contracts, :b_show_accounting_to_employee, :boolean

    add_column :contracts, :client_id, :integer, index: true
    add_column :contracts, :number, :string, index: true
    rename_column :contract_sell_business_details, :contract_id, :sell_contract_id
    rename_column :contract_buy_business_details, :contract_id, :buy_contract_id
    rename_column :contract_sale_commisions, :contract_id, :buy_contract_id

  end
end
