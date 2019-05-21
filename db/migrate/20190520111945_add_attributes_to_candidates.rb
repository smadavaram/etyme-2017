class AddAttributesToCandidates < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates, :passport_number, :string
    add_column :candidates, :ssn, :string
    add_column :candidates, :relocation, :boolean, default: false
    add_column :candidates, :work_authorization, :string
    add_column :candidates, :visa_type, :string
  end
end
