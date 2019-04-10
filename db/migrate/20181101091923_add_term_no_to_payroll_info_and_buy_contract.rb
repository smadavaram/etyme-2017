class AddTermNoToPayrollInfoAndBuyContract < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :payroll_infos, :term_no, :string
    add_column :buy_contracts, :term_no, :string
  end
end
