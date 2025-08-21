class AddColoumnVisaToCandidates < ActiveRecord::Migration[4.2]
  def change
    add_column :candidates, :visa, :integer
  end
end
