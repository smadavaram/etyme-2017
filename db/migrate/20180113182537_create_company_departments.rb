class CreateCompanyDepartments < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :company_departments do |t|
      t.belongs_to :company, index: true
      t.belongs_to :department, index: true
      t.timestamps null: false
    end
  end
end