class ChangeColumnContract < ActiveRecord::Migration
  def change
    rename_column :contracts, :responed_by_id, :respond_by_id
  end
end
