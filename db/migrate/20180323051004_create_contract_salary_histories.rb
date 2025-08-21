class CreateContractSalaryHistories < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :contract_salary_histories do |t|

      t.belongs_to :contract, index: true
      t.belongs_to :company, index: true
      t.belongs_to :candidate, index: true

      t.decimal :amount
      t.decimal :final_amount
      t.text :description
      t.string :salary_type
      t.belongs_to :salable, polymorphic: true

      t.timestamps
    end
  end
end
