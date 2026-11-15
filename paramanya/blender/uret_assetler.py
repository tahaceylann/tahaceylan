"""
Paramanya tarzı modüler 3D varlık üretici (Blender 3.6+ / 4.x, bpy).

Çalıştırma:
  * Blender > Scripting sekmesinde "Run Script"        -> çıktı: <betik klasörü>/fbx
  * Komut satırı:
      blender -b -P uret_assetler.py -- <cikti_klasoru>

Üretilen FBX dosyaları (Unity eksenleri: axis_forward='-Z', axis_up='Y'):
  Tile_City, Tile_Corner, Tile_Corner_Start, Tile_Corner_Island,
  Tile_Corner_Festival, Tile_Corner_WorldTour,
  Building_Tier1_Villa, Building_Tier2_Apartment, Building_Tier3_Hotel,
  Building_Tier4_Landmark (gövde + ayrı Landmark_Crystal nesnesi),
  Dice, Pawn_Base

Kurallar:
  * Tüm nesnelerde materyal slotları AYNI sırada: 0 Base_White,
    1 Team_Color_Accent, 2 Gold_Trim, 3 Glass_Emissive.
    Unity'de slot 1'i oyuncu rengine göre değiştirin (Kırmızı/Mavi/Sarı/Yeşil).
  * Pivot (origin) her nesnenin alt merkezi (Z=0). Kristal hariç: kendi merkezi
    (Unity'de y ekseninde döndürülsün diye).
  * Birim: 1 Blender birimi = 1 metre.
"""
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------
# Sabitler
# --------------------------------------------------------------------------
BASE, TEAM, GOLD, GLASS = 0, 1, 2, 3
MAT_SPECS = [
    # ad, renk (RGBA), metalik, pürüzlülük, emisyon gücü
    ("Base_White", (0.95, 0.94, 0.90, 1.0), 0.0, 0.35, 0.0),
    ("Team_Color_Accent", (0.90, 0.12, 0.12, 1.0), 0.0, 0.30, 0.0),
    ("Gold_Trim", (1.00, 0.70, 0.12, 1.0), 1.0, 0.22, 0.0),
    ("Glass_Emissive", (0.45, 0.85, 1.00, 1.0), 0.0, 0.05, 2.5),
]
COL_NAME = "Paramanya_Assets"


# --------------------------------------------------------------------------
# Materyaller
# --------------------------------------------------------------------------
def _set_input(node, names, value):
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return


def build_materials():
    mats = []
    for name, color, metal, rough, emit in MAT_SPECS:
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None:
            _set_input(bsdf, ["Base Color"], color)
            _set_input(bsdf, ["Metallic"], metal)
            _set_input(bsdf, ["Roughness"], rough)
            # Blender 4.x: "Coat Weight", 3.x: "Clearcoat" (parlak vernik)
            if name in ("Base_White", "Team_Color_Accent"):
                _set_input(bsdf, ["Coat Weight", "Clearcoat"], 0.6)
            if emit > 0:
                _set_input(bsdf, ["Emission Color", "Emission"], color)
                _set_input(bsdf, ["Emission Strength"], emit)
        mat.diffuse_color = color
        mats.append(mat)
    return mats


# --------------------------------------------------------------------------
# Geometri yardımcıları (bmesh) - her parça kendi bmesh'inde üretilir,
# malzeme indeksi atanır, pahlanır ve ana bmesh'e eklenir.
# --------------------------------------------------------------------------
class Builder:
    def __init__(self):
        self.bm = bmesh.new()

    def _merge(self, part):
        tmp = bpy.data.meshes.new("_tmp")
        part.to_mesh(tmp)
        part.free()
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)

    @staticmethod
    def _finish(part, mat, bevel, segs, smooth):
        for f in part.faces:
            f.material_index = mat
            f.smooth = smooth
        if bevel > 0:
            bmesh.ops.bevel(
                part, geom=list(part.edges), offset=bevel, segments=segs,
                affect="EDGES", profile=0.5)
            for f in part.faces:
                f.material_index = mat
                f.smooth = smooth

    def box(self, w, d, h, x=0, y=0, z=0, mat=BASE, bevel=0.0, segs=2, rot=0.0):
        """Alt yüzü z'de, x/y merkezli kutu."""
        p = bmesh.new()
        bmesh.ops.create_cube(p, size=1.0)
        bmesh.ops.scale(p, vec=(w, d, h), verts=p.verts)
        bmesh.ops.translate(p, vec=(0, 0, h / 2), verts=p.verts)
        if rot:
            bmesh.ops.rotate(p, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, "Z"), verts=p.verts)
        bmesh.ops.translate(p, vec=(x, y, z), verts=p.verts)
        self._finish(p, mat, bevel, segs, False)
        self._merge(p)

    def cyl(self, r1, r2, h, x=0, y=0, z=0, mat=BASE, seg=24, bevel=0.0,
            rot=0.0, smooth=True, cap=True):
        """Kesik koni/silindir; alt yüz z'de."""
        p = bmesh.new()
        bmesh.ops.create_cone(p, cap_ends=cap, cap_tris=False, segments=seg,
                              radius1=r1, radius2=r2, depth=h)
        bmesh.ops.translate(p, vec=(0, 0, h / 2), verts=p.verts)
        if rot:
            bmesh.ops.rotate(p, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, "Z"), verts=p.verts)
        bmesh.ops.translate(p, vec=(x, y, z), verts=p.verts)
        self._finish(p, mat, bevel, 2, smooth)
        self._merge(p)

    def hip_roof(self, w, d, h, x=0, y=0, z=0, mat=TEAM):
        """4 yüzlü kırma (piramit) çatı."""
        p = bmesh.new()
        hw, hd = w / 2, d / 2
        v = [p.verts.new(c) for c in
             [(-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0), (0, 0, h)]]
        p.faces.new((v[0], v[3], v[2], v[1]))
        for a, b in [(0, 1), (1, 2), (2, 3), (3, 0)]:
            p.faces.new((v[a], v[b], v[4]))
        bmesh.ops.recalc_face_normals(p, faces=list(p.faces))
        bmesh.ops.translate(p, vec=(x, y, z), verts=p.verts)
        self._finish(p, mat, 0.012, 1, False)
        self._merge(p)

    def sphere(self, r, x=0, y=0, z=0, mat=BASE, sub=2, scale=(1, 1, 1)):
        """Merkezi (x,y,z) olan küre / elipsoid."""
        p = bmesh.new()
        bmesh.ops.create_icosphere(p, subdivisions=sub, radius=r)
        bmesh.ops.scale(p, vec=scale, verts=p.verts)
        bmesh.ops.translate(p, vec=(x, y, z), verts=p.verts)
        self._finish(p, mat, 0, 1, True)
        self._merge(p)

    def torus(self, R, r, x=0, y=0, z=0, mat=GOLD, major=32, minor=10, tilt=0.0):
        """Z eksenli torus; merkez (x,y,z). tilt: X ekseninde eğim (radyan)."""
        p = bmesh.new()
        grid = []
        for i in range(major):
            a = 2 * math.pi * i / major
            row = []
            for j in range(minor):
                b = 2 * math.pi * j / minor
                rr = R + r * math.cos(b)
                row.append(p.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))
            grid.append(row)
        for i in range(major):
            for j in range(minor):
                p.faces.new((grid[i][j], grid[(i + 1) % major][j],
                             grid[(i + 1) % major][(j + 1) % minor], grid[i][(j + 1) % minor]))
        bmesh.ops.recalc_face_normals(p, faces=list(p.faces))
        if tilt:
            bmesh.ops.rotate(p, cent=(0, 0, 0), matrix=Matrix.Rotation(tilt, 3, "X"), verts=p.verts)
        bmesh.ops.translate(p, vec=(x, y, z), verts=p.verts)
        self._finish(p, mat, 0, 1, True)
        self._merge(p)

    def to_object(self, name, mats, collection):
        mesh = bpy.data.meshes.new(name)
        # bmesh'i bozmadan: normalleri tutarlı yap
        bmesh.ops.recalc_face_normals(self.bm, faces=list(self.bm.faces))
        self.bm.to_mesh(mesh)
        self.bm.free()
        for m in mats:  # slot sırası sabit: 0..3
            mesh.materials.append(m)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj


# --------------------------------------------------------------------------
# Varlık tanımları
# --------------------------------------------------------------------------
def tile_city():
    b = Builder()
    # 2.0 x 2.8 x 0.25 pahlı taban
    b.box(2.0, 2.8, 0.25, mat=BASE, bevel=0.07, segs=3)
    # Üst kenarda renk şeridi (Color Header) - şehrin renk grubu = Team slotu
    b.box(1.84, 0.55, 0.05, y=1.12, z=0.25, mat=TEAM, bevel=0.015)
    # Altın çerçeve çizgileri
    b.box(1.84, 0.04, 0.03, y=-1.30, z=0.25, mat=GOLD)
    b.box(1.84, 0.04, 0.03, y=0.74, z=0.25, mat=GOLD)
    # Bina yuvası (Unity'de yapı buraya yerleştirilir)
    b.cyl(0.62, 0.62, 0.03, y=-0.28, z=0.25, mat=GOLD, seg=32)
    b.cyl(0.55, 0.55, 0.045, y=-0.28, z=0.25, mat=BASE, seg=32)
    return b


def _corner_base(b):
    b.box(2.8, 2.8, 0.25, mat=BASE, bevel=0.08, segs=3)
    b.cyl(1.05, 1.0, 0.12, z=0.25, mat=GOLD, seg=48)         # yükseltilmiş daire
    b.cyl(0.88, 0.88, 0.14, z=0.25, mat=TEAM, seg=48)        # iç platform (üst yüz)
    b.cyl(0.80, 0.80, 0.15, z=0.25, mat=BASE, seg=48)


def tile_corner(kind=None):
    b = Builder()
    _corner_base(b)
    z0 = 0.40  # platform üst yüzeyi
    if kind == "Start":     # bayrak
        b.cyl(0.04, 0.04, 1.0, z=z0, mat=GOLD, seg=12)
        b.box(0.55, 0.03, 0.32, x=0.30, z=z0 + 0.62, mat=TEAM, bevel=0.008)
        b.sphere(0.07, z=z0 + 1.02, mat=GOLD)
    elif kind == "Island":  # palmiye + cam kubbe
        b.cyl(0.07, 0.04, 0.8, x=-0.15, z=z0, mat=GOLD, seg=10)
        for k in range(5):
            a = k * 2 * math.pi / 5
            b.sphere(0.04, x=-0.15 + 0.28 * math.cos(a), y=0.28 * math.sin(a),
                     z=z0 + 0.78, mat=TEAM, sub=1, scale=(5, 1.4, 0.8))
        b.sphere(0.35, x=0.30, y=-0.1, z=z0, mat=GLASS, sub=2, scale=(1, 1, 0.6))
    elif kind == "Festival":  # kupa
        b.cyl(0.28, 0.20, 0.08, z=z0, mat=GOLD, seg=20)
        b.cyl(0.06, 0.06, 0.35, z=z0 + 0.08, mat=GOLD, seg=12)
        b.cyl(0.10, 0.34, 0.38, z=z0 + 0.43, mat=GOLD, seg=20)
        b.sphere(0.10, z=z0 + 0.95, mat=GLASS, sub=1)
    elif kind == "WorldTour":  # küre + halka
        b.cyl(0.18, 0.12, 0.10, z=z0, mat=GOLD, seg=20)
        b.sphere(0.45, z=z0 + 0.62, mat=GLASS, sub=3)
        b.torus(0.62, 0.035, z=z0 + 0.62, mat=GOLD, tilt=math.radians(70))
    return b


def building_villa():
    b = Builder()
    b.box(0.60, 0.60, 0.04, mat=GOLD, bevel=0.01)                       # kaide 0.6m taban
    b.box(0.52, 0.52, 0.32, z=0.04, mat=BASE, bevel=0.02)               # gövde
    b.hip_roof(0.64, 0.64, 0.26, z=0.36, mat=TEAM)                      # kırma çatı
    b.box(0.08, 0.08, 0.20, x=0.15, y=0.10, z=0.50, mat=BASE, bevel=0.008)  # baca
    b.box(0.10, 0.02, 0.17, y=-0.265, z=0.04, mat=GOLD)                 # kapı
    for sx in (-0.15, 0.15):
        b.box(0.10, 0.02, 0.10, x=sx, y=-0.265, z=0.20, mat=GLASS)
    return b


def building_apartment():
    b = Builder()
    b.box(0.70, 0.70, 0.04, mat=GOLD, bevel=0.01)
    fh, z = 0.30, 0.04
    for i in range(3):                                                    # 3 kat
        b.box(0.60, 0.60, fh, z=z, mat=BASE, bevel=0.018)
        b.box(0.62, 0.62, 0.025, z=z + fh, mat=GOLD)                      # kat bandı
        for sx in (-0.17, 0.17):
            b.box(0.14, 0.015, 0.13, x=sx, y=-0.305, z=z + 0.10, mat=GLASS)
        if i > 0:                                                          # balkon çıkıntısı
            b.box(0.34, 0.14, 0.03, y=-0.37, z=z, mat=TEAM, bevel=0.008)
            b.box(0.34, 0.012, 0.08, y=-0.435, z=z + 0.03, mat=GOLD)
        z += fh + 0.025
    b.box(0.66, 0.66, 0.05, z=z, mat=TEAM, bevel=0.015)                   # çatı plakası
    b.box(0.14, 0.14, 0.12, x=0.15, y=0.12, z=z + 0.05, mat=BASE, bevel=0.01)
    return b


def building_hotel():
    b = Builder()
    b.box(0.80, 0.80, 0.05, mat=GOLD, bevel=0.012)
    fh, z = 0.26, 0.05
    for i in range(5):                                                    # 5 kat
        w = 0.70 - 0.02 * i
        b.box(w, w, fh, z=z, mat=BASE, bevel=0.018)
        b.box(w + 0.02, w + 0.02, 0.02, z=z + fh, mat=GOLD)
        for sx in (-0.2, 0.0, 0.2):
            b.box(0.11, 0.012, 0.12, x=sx, y=-(w / 2 + 0.005), z=z + 0.09, mat=GLASS)
        z += fh + 0.02
    # Giriş tentesi
    b.box(0.34, 0.20, 0.025, y=-0.45, z=0.22, mat=TEAM, bevel=0.008)
    for sx in (-0.15, 0.15):
        b.cyl(0.012, 0.012, 0.17, x=sx, y=-0.53, z=0.05, mat=GOLD, seg=8)
    # Çatı terası + korkuluk
    b.box(0.64, 0.64, 0.03, z=z, mat=GOLD, bevel=0.008)
    for sx in (-0.3, 0.3):
        b.box(0.02, 0.62, 0.09, x=sx, z=z + 0.03, mat=GOLD)
        b.box(0.62, 0.02, 0.09, y=sx, z=z + 0.03, mat=GOLD)
    b.cyl(0.07, 0.07, 0.01, x=0.1, y=0.1, z=z + 0.03, mat=GLASS, seg=16)   # havuz
    return b


def building_landmark():
    """Gövde (kaide + kule) ve ayrı dönen kristal nesnesi döndürür."""
    b = Builder()
    b.cyl(0.55, 0.50, 0.10, mat=GOLD, seg=8, smooth=False, bevel=0.01)     # altın kaide 1.1m
    b.cyl(0.46, 0.40, 0.10, z=0.10, mat=GOLD, seg=8, smooth=False)
    b.cyl(0.36, 0.26, 0.90, z=0.20, mat=BASE, seg=8, smooth=False)        # gövde
    b.torus(0.28, 0.025, z=0.80, mat=GOLD, major=24)
    b.cyl(0.26, 0.20, 0.55, z=1.10, mat=BASE, seg=8, smooth=False)
    b.torus(0.21, 0.025, z=1.40, mat=TEAM, major=24)
    b.cyl(0.20, 0.10, 0.25, z=1.65, mat=GOLD, seg=8, smooth=False)         # tepe tacı
    b.cyl(0.03, 0.02, 0.14, z=1.90, mat=GOLD, seg=8)                       # kristal tutucu
    for k in range(4):                                                     # pencere şeritleri
        a = k * math.pi / 2
        b.box(0.05, 0.015, 0.45, x=0.3 * math.cos(a) * 0.9, y=0.3 * math.sin(a) * 0.9,
              z=0.35, mat=GLASS, rot=a + math.pi / 2)
    c = Builder()
    # 2.2 m tepe: merkez z=1.95, yükseklik ±0.25
    c.sphere(0.20, sub=1, scale=(0.9, 0.9, 1.25), mat=GLASS)
    return b, c


def dice():
    b = Builder()
    size, r = 0.5, 0.045
    b.box(size, size, size, mat=BASE, bevel=0.06, segs=4)
    obj_pips = []  # (merkez) listesi
    o, q = size / 2, size / 4
    faces = {
        1: [(0, 0)], 2: [(-q, -q), (q, q)], 3: [(-q, -q), (0, 0), (q, q)],
        4: [(-q, -q), (-q, q), (q, -q), (q, q)],
        5: [(-q, -q), (-q, q), (q, -q), (q, q), (0, 0)],
        6: [(-q, -q), (-q, 0), (-q, q), (q, -q), (q, 0), (q, q)],
    }
    zc = size / 2
    # Zar yüz → normal yönü (karşıt yüzler toplamı 7): 1:+Z 6:-Z 2:+X 5:-X 3:-Y 4:+Y
    def place(face, u, v):
        return {1: (u, v, zc + o), 6: (u, v, zc - o), 2: (o, u, zc + v), 5: (-o, u, zc + v),
                3: (u, -o, zc + v), 4: (u, o, zc + v)}[face]
    # Oyuklar: yüzeye merkezli küre ile Boolean fark -> basit çözüm: bmesh'te
    # sonradan boolean yerine "içe gömülü" küre malzeme ayrımı için iki adım:
    centers = []
    for f, pts in faces.items():
        for u, v in pts:
            centers.append(place(f, u, v))
    return b, centers, r


def pawn_base():
    b = Builder()
    b.cyl(0.30, 0.30, 0.05, mat=GOLD, seg=32, bevel=0.008)                 # altın halka
    b.cyl(0.25, 0.22, 0.10, z=0.05, mat=BASE, seg=32)                      # kaide
    b.cyl(0.14, 0.10, 0.30, z=0.15, mat=TEAM, seg=20)                      # gövde
    b.sphere(0.12, z=0.54, mat=BASE, sub=2)                                # kafa
    b.torus(0.09, 0.015, z=0.46, mat=GOLD, major=20)                       # yaka
    return b


# --------------------------------------------------------------------------
# Zar oyukları (boolean) - bpy.ops gerektirir
# --------------------------------------------------------------------------
def carve_pips(dice_obj, centers, r):
    me = dice_obj.data
    pips = []
    for i, c in enumerate(centers):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
        bmesh.ops.translate(bm, vec=c, verts=bm.verts)
        m = bpy.data.meshes.new(f"_pip{i}")
        bm.to_mesh(m)
        bm.free()
        o = bpy.data.objects.new(f"_pip{i}", m)
        bpy.context.scene.collection.objects.link(o)
        pips.append(o)
    # Hepsini tek kesici nesnede birleştir
    bpy.ops.object.select_all(action="DESELECT")
    for o in pips:
        o.select_set(True)
    bpy.context.view_layer.objects.active = pips[0]
    bpy.ops.object.join()
    cutter = bpy.context.view_layer.objects.active
    mod = dice_obj.modifiers.new("pips", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    try:
        mod.solver = "EXACT"
    except Exception:
        pass
    bpy.ops.object.select_all(action="DESELECT")
    dice_obj.select_set(True)
    bpy.context.view_layer.objects.active = dice_obj
    bpy.ops.object.modifier_apply(modifier="pips")
    bpy.data.objects.remove(cutter, do_unlink=True)

    # Oyuk yüzeylerini Team_Color_Accent yap (Unity'de nokta rengi)
    bm = bmesh.new()
    bm.from_mesh(dice_obj.data)
    cs = [Vector(c) for c in centers]
    for f in bm.faces:
        p = f.calc_center_median()
        if any((p - c).length < r * 1.05 for c in cs):
            f.material_index = TEAM
    bm.to_mesh(dice_obj.data)
    bm.free()


# --------------------------------------------------------------------------
# Dışa aktarma
# --------------------------------------------------------------------------
def export_fbx(objs, name, out_dir):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(out_dir, name + ".fbx")
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={"MESH"},
        axis_forward="-Z",
        axis_up="Y",
        apply_scale_options="FBX_SCALE_ALL",
        apply_unit_scale=True,
        bake_space_transform=True,
        mesh_smooth_type="FACE",
        path_mode="AUTO",
    )
    return path


def export_all(assets, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    return [export_fbx(objs, name, out_dir) for name, objs in assets.items()]


def main(out_dir):
    # Temiz sahne
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    col = bpy.data.collections.get(COL_NAME) or bpy.data.collections.new(COL_NAME)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    mats = build_materials()

    assets, x = {}, 0.0

    def add(name, builder):
        nonlocal x
        o = builder.to_object(name, mats, col)
        o.location = (0, 0, 0)  # origin = alt merkez (geometri z>=0 üretildi)
        assets[name] = [o]
        return o

    add("Tile_City", tile_city())
    add("Tile_Corner", tile_corner())
    add("Tile_Corner_Start", tile_corner("Start"))
    add("Tile_Corner_Island", tile_corner("Island"))
    add("Tile_Corner_Festival", tile_corner("Festival"))
    add("Tile_Corner_WorldTour", tile_corner("WorldTour"))
    add("Building_Tier1_Villa", building_villa())
    add("Building_Tier2_Apartment", building_apartment())
    add("Building_Tier3_Hotel", building_hotel())

    body_b, crystal_b = building_landmark()
    body = body_b.to_object("Building_Tier4_Landmark", mats, col)
    crystal = crystal_b.to_object("Landmark_Crystal", mats, col)
    crystal.location = (0, 0, 1.95)  # kendi merkezinde döner
    assets["Building_Tier4_Landmark"] = [body, crystal]

    db, centers, r = dice()
    d = db.to_object("Dice", mats, col)
    carve_pips(d, centers, r)
    assets["Dice"] = [d]
    add("Pawn_Base", pawn_base())

    # Önizleme için yan yana diz (FBX'e yazmadan ÖNCE konumlar sıfırlı olmalı → export sonrası dizilir)
    paths = export_all(assets, out_dir)

    for name, objs in assets.items():
        for o in objs:
            if o.name != "Landmark_Crystal":
                o.location.x = x
        if name == "Building_Tier4_Landmark":
            crystal.location.x = x
        x += 3.4
    print("[Paramanya] %d FBX üretildi -> %s" % (len(paths), out_dir))
    for p in paths:
        print("  ", p)


def _out_dir():
    if "--" in sys.argv:
        rest = sys.argv[sys.argv.index("--") + 1:]
        if rest:
            return os.path.abspath(rest[0])
    try:
        base = os.path.dirname(os.path.abspath(__file__))
    except NameError:  # Blender metin düzenleyicisinde __file__ yok
        base = os.path.dirname(bpy.data.filepath) or os.getcwd()
    return os.path.join(base, "fbx")


if __name__ == "__main__":
    main(_out_dir())
