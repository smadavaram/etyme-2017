class CreateTaxInfos < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :tax_infos do |t|
      t.belongs_to :payroll_info
      t.string :tax_term
      t.timestamps
    end
  end
end
