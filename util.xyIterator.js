/**
 * An endless iterator which advances in a square box beginning at the top-left.
 *
 *     67 68 69 70 71
 *  19 P
 *  18 O  9  A  B  C
 *  17 N  8  1  2  D
 *  16 M  7  0  3  E
 *  15 L  6  5  4  F
 *  14 K  J  I  H  G
 *
 *  Easy starting-points are 0, 1, A, etc. Use the ring number to indicate these.
 */
class XYIterator {
    // public y;
    // public x;
    // private _ring;
    // private _dir = TOP; // dir of next step
    // private _step;

    constructor(xy, ring) { // TODO borders
        this._dir = TOP;
        this.x = xy.x;
        if (ring === undefined) {
            this._ring = 0;
            this._step = 2;
            this.y = xy.y + 1;
        } else {
            this._ring = ring - 1;
            this._step = 1;
            this.y = xy.y;
        }
    }

    /**
     * Useful for heuristic to stop searching when hitting invalid locations.
     */
    depth() {
        return this._ring;
    }

    next() {
        XYIterator.dirTransform(this, this._dir);

        --this._step;

        if (this._step <= 0) {
            this._step = 2 * this._ring;
            switch (this._dir) {
                case TOP:
                    this._ring++;
                    this._step++;
                    this._dir = RIGHT;
                    break;
                case RIGHT:
                    this._dir = BOTTOM;
                    break;
                case BOTTOM:
                    this._dir = LEFT;
                    break;
                case LEFT:
                    this._step++;
                    this._dir = TOP;
                    break;
                default:
                    throw new Error("illegal _dir=" + this._dir);
            }
        }

        return {
            done: false,
            value: {x: this.x, y: this.y},
        };
    }

    static dirTransform(origin, dir) {
        switch (dir) {
            case TOP_RIGHT:
                origin.x++;
            case TOP:
                origin.y--;
                break;

            case BOTTOM_RIGHT:
                origin.y++;
            case RIGHT:
                origin.x++;
                break;

            case BOTTOM_LEFT:
                origin.x--;
            case BOTTOM:
                origin.y++;
                break;

            case TOP_LEFT:
                origin.y--;
            case LEFT:
                origin.x--;
                break;

            default:
        }

        return origin;
    }
}
module.exports = XYIterator;