class AddColumnsInContract < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :contract, :client_name, :string
    add_column :contract, :candidate_name, :string
    add_column :contract, :work_location, :string

    add_column :contract, :customer_rate, :decimal
    add_column :contract, :invoice_terms_period, :string

    add_column :contract, :show_accounting_to_employee, :boolean
    add_column :contract, :candidate_id, :integer, index: true

    add_column :contract, :b_ssn, :string

    add_column :contract, :buy_company_id, :integer, index: true

    add_column :contract, :payrate, :decimal
    add_column :contract, :b_time_sheet, :string
    add_column :contract, :payment_term, :string
    add_column :contract, :b_show_accounting_to_employee, :boolean
  end
end