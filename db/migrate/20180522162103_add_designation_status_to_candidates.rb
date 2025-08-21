class AddDesignationStatusToCandidates < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :candidates, :designation_status, :string
  end
end
