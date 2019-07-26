class ChangeInContract < ActiveRecord::Migration[4.2][5.1]
  def change
    remove_column :contract, :client_name, :string
    remove_column :contract, :candidate_name, :string
    remove_column :contract, :customer_rate, :decimal
    remove_column :contract, :invoice_terms_period, :string
    remove_column :contract, :show_accounting_to_employee, :boolean
    remove_column :contract, :b_ssn, :string
    remove_column :contract, :buy_company_id, :integer, index: true
    remove_column :contract, :payrate, :decimal
    remove_column :contract, :b_time_sheet, :string
    remove_column :contract, :payment_term, :string
    remove_column :contract, :b_show_accounting_to_employee, :boolean

    add_column :contract, :client_id, :integer, index: true
    add_column :contract, :number, :string, index: true
    rename_column :contract_sell_business_details, :contract_id, :sell_contract_id
    rename_column :contract_buy_business_details, :contract_id, :buy_contract_id
    rename_column :contract_sale_commisions, :contract_id, :buy_contract_id

  end
end
