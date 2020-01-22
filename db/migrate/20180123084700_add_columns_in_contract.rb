class AddColumnsInContract < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :contracts, :client_name, :string
    add_column :contracts, :candidate_name, :string
    add_column :contracts, :work_location, :string

    add_column :contracts, :customer_rate, :decimal
    add_column :contracts, :invoice_terms_period, :string

    add_column :contracts, :show_accounting_to_employee, :boolean
    add_column :contracts, :candidate_id, :integer, index: true

    add_column :contracts, :b_ssn, :string

    add_column :contracts, :buy_company_id, :integer, index: true

    add_column :contracts, :payrate, :decimal
    add_column :contracts, :b_time_sheet, :string
    add_column :contracts, :payment_term, :string
    add_column :contracts, :b_show_accounting_to_employee, :boolean
  end
end
