class AddEverWorkedWithCompanyToCandidates < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :candidates, :ever_worked_with_company, :string
  end
end
