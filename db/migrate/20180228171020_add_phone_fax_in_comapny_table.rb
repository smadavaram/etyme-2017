class AddPhoneFaxInComapnyTable < ActiveRecord::Migration[5.1]
  def change
    add_column :companies, :fax_number, :string
  end
end