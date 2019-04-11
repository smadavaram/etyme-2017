class AddCurrentLocationToCandidates < ActiveRecord::Migration[4.2]
  def change
    add_column :candidates, :location, :string
  end
end
