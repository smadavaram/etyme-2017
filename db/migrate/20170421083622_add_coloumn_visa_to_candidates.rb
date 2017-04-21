class AddColoumnVisaToCandidates < ActiveRecord::Migration
  def change
    add_column :candidates, :visa, :integer
  end
end
