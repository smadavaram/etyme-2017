class AddDesignationStatusToCandidates < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates, :designation_status, :string
  end
end
