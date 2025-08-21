class AddAgeColumnInUserTable < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :users, :age, :integer
  end
end