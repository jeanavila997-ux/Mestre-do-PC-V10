function Table(table)
  local count = #table.colspecs

  if count == 3 then
    table.colspecs = {
      { pandoc.AlignLeft, 0.22 },
      { pandoc.AlignLeft, 0.34 },
      { pandoc.AlignLeft, 0.44 }
    }
  elseif count == 2 then
    table.colspecs = {
      { pandoc.AlignLeft, 0.36 },
      { pandoc.AlignLeft, 0.64 }
    }
  end

  return table
end

