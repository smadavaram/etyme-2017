class AddLocationFieldsToCandidate < ActiveRecord::Migration[5.2]
  def change
    add_column :candidates, :city, :text
    add_column :candidates, :state, :text
    add_column :candidates, :country, :text
  end
end
