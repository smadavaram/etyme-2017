class AddFieldsToPayrollInfoAndBuyContract < ActiveRecord::Migration[5.1]
  def change
    add_column :payroll_infos, :term_no_2, :string
    add_column :payroll_infos, :payroll_term_2, :string
    add_column :buy_contracts, :term_no_2, :string    
    add_column :buy_contracts, :payment_term_2, :string
  end
end
