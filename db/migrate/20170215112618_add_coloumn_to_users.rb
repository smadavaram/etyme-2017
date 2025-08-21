class AddColoumnToUsers < ActiveRecord::Migration[4.2]
  def change
    add_column :users, :visa_status , :integer
    add_column :users, :availability, :date
    add_column :users, :relocation  , :integer ,default: 0
  end
end
