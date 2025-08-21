class AddPhoneFaxInComapnyTable < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :companies, :fax_number, :string
  end
end